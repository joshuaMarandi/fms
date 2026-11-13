"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Option, OptionSource } from "@/lib/forms/schema";
import { sendMessagesSoon, WORKFLOW_RPCS, WORKFLOW_TABLES } from "@/lib/messaging/soon";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; hint?: string };

type PgError = { message: string; hint?: string | null; code?: string; details?: string | null };

function friendly(e: PgError): ActionResult<never> {
  const hint = e.hint ?? undefined;
  let message = e.message;
  if (e.code === "42501") message = e.message || "You do not have permission for this action.";
  if (e.code === "23505") message = "A record with the same unique value already exists.";
  if (e.code === "23503") message = e.details ? `Related record missing: ${e.details}` : "A related record is missing.";
  return { ok: false, error: message, hint };
}

const tableCache: { list: Set<string> | null; at: number } = { list: null, at: 0 };

async function allowedTables() {
  if (tableCache.list && Date.now() - tableCache.at < 60_000) return tableCache.list;
  const supabase = await createClient();
  const { data } = await supabase.from("table_resources").select("table_name");
  tableCache.list = new Set((data ?? []).map((r: { table_name: string }) => r.table_name));
  tableCache.at = Date.now();
  return tableCache.list;
}

export type SaveInput = {
  table: string;
  id?: string | null;
  values: Record<string, unknown>;
  children?: { childTable: string; fk: string; rows: Record<string, unknown>[]; filter?: Record<string, string | number | boolean> }[];
  revalidate?: string[];
};

/** Insert or update a record plus its repeatable rows. RLS and triggers enforce permissions and rules. */
export async function saveRecord(input: SaveInput): Promise<ActionResult<{ id: string }>> {
  const tables = await allowedTables();
  if (!tables.has(input.table)) return { ok: false, error: `Unknown table ${input.table}` };
  for (const c of input.children ?? []) if (!tables.has(c.childTable)) return { ok: false, error: `Unknown table ${c.childTable}` };

  const supabase = await createClient();
  const values = { ...input.values };
  delete values.id;
  delete values.company_id;
  delete values.created_at;
  delete values.created_by;
  delete values.updated_at;
  delete values.updated_by;
  delete values.deleted_at;

  let id = input.id ?? null;
  if (id) {
    const { error } = await supabase.from(input.table).update(values).eq("id", id);
    if (error) return friendly(error);
  } else {
    const { data, error } = await supabase.from(input.table).insert(values).select("id").single();
    if (error) return friendly(error);
    id = (data as { id: string }).id;
  }

  for (const child of input.children ?? []) {
    let existingQuery = supabase.from(child.childTable).select("id").eq(child.fk, id);
    for (const [k, v] of Object.entries(child.filter ?? {})) existingQuery = existingQuery.eq(k, v);
    const { data: existing, error: exErr } = await existingQuery;
    if (exErr) return friendly(exErr);
    const keep = new Set(child.rows.map((r) => r.id).filter(Boolean) as string[]);
    const toDelete = (existing ?? []).map((r: { id: string }) => r.id).filter((x: string) => !keep.has(x));
    if (toDelete.length) {
      const { error } = await supabase.from(child.childTable).delete().in("id", toDelete);
      if (error) return friendly(error);
    }
    let seq = 1;
    for (const row of child.rows) {
      const r: Record<string, unknown> = { ...row, [child.fk]: id };
      if ("seq" in r || child.childTable === "km_log_trips") r.seq = seq;
      seq++;
      if (r.id) {
        const rid = r.id as string;
        delete r.id;
        const { error } = await supabase.from(child.childTable).update(r).eq("id", rid);
        if (error) return friendly(error);
      } else {
        delete r.id;
        const { error } = await supabase.from(child.childTable).insert(r);
        if (error) return friendly(error);
      }
    }
  }

  for (const p of input.revalidate ?? []) revalidatePath(p);
  if (WORKFLOW_TABLES.has(input.table)) await sendMessagesSoon();
  return { ok: true, data: { id: id! } };
}

/** Soft delete: sets deleted_at; the database checks the delete permission. */
export async function deleteRecord(table: string, id: string, revalidate: string[] = []): Promise<ActionResult<null>> {
  const tables = await allowedTables();
  if (!tables.has(table)) return { ok: false, error: `Unknown table ${table}` };
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return friendly(error);
  for (const p of revalidate) revalidatePath(p);
  return { ok: true, data: null };
}

/** Generic RPC call with friendly errors. */
export async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>, revalidate: string[] = []): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return friendly(error);
  for (const p of revalidate) revalidatePath(p);
  if (WORKFLOW_RPCS.has(fn)) await sendMessagesSoon();
  return { ok: true, data: data as T };
}

export type LoadedOptions = Partial<Record<OptionSource, (Option & Record<string, unknown>)[]>>;

/** Loads dropdown options for the given sources (RLS filters what the user may see). */
export async function loadOptions(sources: OptionSource[]): Promise<LoadedOptions> {
  const supabase = await createClient();
  const out: LoadedOptions = {};
  await Promise.all(
    sources.map(async (s) => {
      switch (s) {
        case "vehicles": {
          const [{ data }, { data: activity }] = await Promise.all([
            supabase.from("vehicles").select("id, registration, make, model, odometer_km, fuel_tank_capacity_l, target_km_per_l, yom, owner_name, status, engine_type").is("deleted_at", null).order("registration"),
            supabase.from("v_vehicle_activity").select("vehicle_id, last_km_end, last_fuel_odometer, last_fuel_filled"),
          ]);
          const act = new Map(((activity ?? []) as Record<string, unknown>[]).map((a) => [a.vehicle_id as string, a]));
          out.vehicles = (data ?? []).map((v: Record<string, unknown>) => ({
            ...v,
            last_km_end: act.get(v.id as string)?.last_km_end ?? null,
            last_fuel_odometer: act.get(v.id as string)?.last_fuel_odometer ?? null,
            last_fuel_filled: act.get(v.id as string)?.last_fuel_filled ?? null,
            value: v.id as string,
            label: `${v.registration} (${v.make} ${v.model})`,
          }));
          break;
        }
        case "drivers": {
          const { data } = await supabase.from("drivers").select("id, full_name, phone, employer, employment_number, job_title, department, profile_id, sex, date_of_birth, years_driving").is("deleted_at", null).eq("is_active", true).order("full_name");
          out.drivers = (data ?? []).map((d: Record<string, unknown>) => ({ ...d, value: d.id as string, label: d.full_name as string }));
          break;
        }
        case "sites": {
          const { data } = await supabase.from("sites").select("id, name, region").is("deleted_at", null).order("name");
          out.sites = (data ?? []).map((x: Record<string, unknown>) => ({ ...x, value: x.id as string, label: x.name as string }));
          break;
        }
        case "profiles": {
          const { data } = await supabase.from("profiles").select("id, full_name, email, phone, job_title, department, employment_number, employer, driver_id").eq("is_active", true).order("full_name");
          out.profiles = (data ?? []).map((x: Record<string, unknown>) => ({ ...x, value: x.id as string, label: x.full_name as string }));
          break;
        }
        case "leave_categories": {
          const { data } = await supabase.from("leave_categories").select("id, name, counts_against_balance").is("deleted_at", null).order("name");
          out.leave_categories = (data ?? []).map((x: Record<string, unknown>) => ({ ...x, value: x.id as string, label: x.name as string }));
          break;
        }
        case "roles": {
          const { data } = await supabase.from("roles").select("id, name, is_system, is_owner, is_admin, company_id").order("name");
          out.roles = (data ?? []).map((x: Record<string, unknown>) => ({ ...x, value: x.id as string, label: x.name as string }));
          break;
        }
        case "companies": {
          const { data } = await supabase.from("companies").select("id, name").is("deleted_at", null).order("name");
          out.companies = (data ?? []).map((x: Record<string, unknown>) => ({ ...x, value: x.id as string, label: x.name as string }));
          break;
        }
        case "work_orders": {
          const { data } = await supabase.from("work_orders").select("id, order_number, garage_name, vehicle_id, date_out").is("deleted_at", null).order("date_out", { ascending: false }).limit(200);
          out.work_orders = (data ?? []).map((x: Record<string, unknown>) => ({ ...x, value: x.id as string, label: `${x.order_number ?? ""} ${x.garage_name ?? ""}`.trim() || (x.id as string) }));
          break;
        }
        case "maintenance_requests": {
          const { data } = await supabase.from("maintenance_requests").select("id, request_date, vehicle_id, reason, status").is("deleted_at", null).order("request_date", { ascending: false }).limit(200);
          out.maintenance_requests = (data ?? []).map((x: Record<string, unknown>) => ({ ...x, value: x.id as string, label: `${x.request_date} ${x.reason}` }));
          break;
        }
        case "fuel_requests": {
          const { data } = await supabase.from("fuel_requests").select("id, request_date, vehicle_id, driver_id, fuel_required_l, approved_l, status, previous_odometer, current_odometer").is("deleted_at", null).in("status", ["approved", "submitted"]).order("request_date", { ascending: false }).limit(200);
          out.fuel_requests = (data ?? []).map((x: Record<string, unknown>) => ({ ...x, value: x.id as string, label: `${x.request_date} (${x.fuel_required_l} L)` }));
          break;
        }
      }
    }),
  );
  return out;
}
