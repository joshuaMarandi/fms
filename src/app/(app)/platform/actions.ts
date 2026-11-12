"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/data/records";
import { inviteUserServer } from "@/lib/users/invite";
import { sendMail } from "@/lib/email/mailer";
import { registrationRejectedEmail } from "@/lib/email/templates";

export type PackageInput = {
  id?: string | null;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billing_period: "monthly" | "quarterly" | "yearly";
  max_vehicles: number;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  resource_keys: string[];
};

export type CompanyInput = {
  id?: string | null;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  package_id: string | null;
  status: "pending" | "trial" | "active" | "suspended" | "cancelled";
  subscription_start: string | null;
  subscription_end: string | null;
  notes: string | null;
};

async function ownerClient() {
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (!isOwner) throw new Error("Only the system owner can do this");
  return supabase;
}

function fail(e: unknown): ActionResult<never> {
  const err = e as { message?: string; hint?: string | null; code?: string };
  if (err.code === "23505") return { ok: false, error: "A record with the same name already exists." };
  return { ok: false, error: err.message ?? "Something went wrong.", hint: err.hint ?? undefined };
}

export async function savePackage(input: PackageInput): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await ownerClient();
    if (!input.resource_keys.length) return { ok: false, error: "Choose at least one module." };
    const row = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price: input.price,
      currency: input.currency,
      billing_period: input.billing_period,
      max_vehicles: input.max_vehicles,
      is_active: input.is_active,
      is_public: input.is_public,
      sort_order: input.sort_order,
    };
    let id = input.id ?? null;
    if (id) {
      const { error } = await supabase.from("packages").update(row).eq("id", id);
      if (error) return fail(error);
    } else {
      const { data, error } = await supabase.from("packages").insert(row).select("id").single();
      if (error) return fail(error);
      id = (data as { id: string }).id;
    }
    const { error: delErr } = await supabase.from("package_resources").delete().eq("package_id", id);
    if (delErr) return fail(delErr);
    const { error: insErr } = await supabase.from("package_resources").insert(input.resource_keys.map((k) => ({ package_id: id, resource_key: k })));
    if (insErr) return fail(insErr);
    revalidatePath("/platform/packages");
    revalidatePath("/");
    return { ok: true, data: { id: id! } };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePackage(id: string): Promise<ActionResult<null>> {
  try {
    const supabase = await ownerClient();
    const { count } = await supabase.from("companies").select("id", { count: "exact", head: true }).eq("package_id", id).is("deleted_at", null);
    if ((count ?? 0) > 0) return { ok: false, error: "Move its companies to another package before deleting it.", hint: "package_in_use" };
    const { error } = await supabase.from("packages").update({ deleted_at: new Date().toISOString(), is_active: false, is_public: false }).eq("id", id);
    if (error) return fail(error);
    revalidatePath("/platform/packages");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCompany(input: CompanyInput): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await ownerClient();
    const row = {
      name: input.name.trim(),
      contact_name: input.contact_name || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      address: input.address || null,
      city: input.city || null,
      country: input.country || null,
      package_id: input.package_id || null,
      status: input.status,
      subscription_start: input.subscription_start || null,
      subscription_end: input.subscription_end || null,
      notes: input.notes || null,
    };
    let id = input.id ?? null;
    if (id) {
      const { error } = await supabase.from("companies").update(row).eq("id", id);
      if (error) return fail(error);
    } else {
      const { data, error } = await supabase.from("companies").insert({ ...row, settings: { currency: "TZS", fuel_price_per_litre: 3150, default_target_km_per_l: 9 } }).select("id").single();
      if (error) return fail(error);
      id = (data as { id: string }).id;
    }
    revalidatePath("/platform");
    revalidatePath("/platform/companies");
    revalidatePath(`/platform/companies/${id}`);
    return { ok: true, data: { id: id! } };
  } catch (e) {
    return fail(e);
  }
}

export async function setCompanyStatus(id: string, status: CompanyInput["status"]): Promise<ActionResult<null>> {
  try {
    const supabase = await ownerClient();
    const { error } = await supabase.from("companies").update({ status }).eq("id", id);
    if (error) return fail(error);
    revalidatePath("/platform/companies");
    revalidatePath(`/platform/companies/${id}`);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** Invite the first (or another) Admin into a company. */
export async function inviteCompanyAdmin(companyId: string, person: { full_name: string; email: string; phone?: string | null }): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await ownerClient();
    const { data: adminRole } = await supabase.from("roles").select("id").eq("is_admin", true).eq("is_system", true).limit(1).maybeSingle();
    if (!adminRole) return { ok: false, error: "The Admin role is missing." };

    const invited = await inviteUserServer({
      email: person.email,
      full_name: person.full_name,
      phone: person.phone ?? null,
      role_id: (adminRole as { id: string }).id,
      company_id: companyId,
      job_title: "Administrator",
    });
    if (!invited.ok) return invited;
    const userId = invited.data.id;

    // Delegation ceiling = the modules in the company's package.
    const { data: company } = await supabase.from("companies").select("package_id").eq("id", companyId).maybeSingle();
    const pkg = (company as { package_id: string | null } | null)?.package_id;
    if (pkg) {
      const { data: keys } = await supabase.from("package_resources").select("resource_key").eq("package_id", pkg);
      const rows = [{ user_id: userId, resource_key: "dashboard" }, ...((keys ?? []) as { resource_key: string }[]).map((k) => ({ user_id: userId, resource_key: k.resource_key }))];
      await supabase.from("admin_ceilings").upsert(rows, { onConflict: "user_id,resource_key", ignoreDuplicates: true });
    }
    revalidatePath(`/platform/companies/${companyId}`);
    return { ok: true, data: { id: userId } };
  } catch (e) {
    return fail(e);
  }
}

export async function approveRegistration(input: { id: string; package_id: string; status: CompanyInput["status"]; subscription_end: string | null }): Promise<ActionResult<{ companyId: string; inviteError?: string }>> {
  try {
    const supabase = await ownerClient();
    const { data: reg } = await supabase.from("company_registrations").select("*").eq("id", input.id).maybeSingle();
    if (!reg) return { ok: false, error: "Registration not found." };
    const { data: companyId, error } = await supabase.rpc("approve_registration", { p_id: input.id, p_package: input.package_id, p_status: input.status, p_subscription_end: input.subscription_end });
    if (error) return fail(error);
    const r = reg as { contact_name: string; email: string; phone: string | null };
    const invite = await inviteCompanyAdmin(companyId as string, { full_name: r.contact_name, email: r.email, phone: r.phone });
    revalidatePath("/platform/registrations");
    revalidatePath("/platform/companies");
    return { ok: true, data: { companyId: companyId as string, inviteError: invite.ok ? undefined : invite.error } };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectRegistration(id: string, reason: string): Promise<ActionResult<null>> {
  try {
    const supabase = await ownerClient();
    const { data: reg } = await supabase.from("company_registrations").select("company_name, contact_name, email").eq("id", id).maybeSingle();
    const { error } = await supabase.rpc("reject_registration", { p_id: id, p_reason: reason });
    if (error) return fail(error);
    if (reg) {
      const r = reg as { company_name: string; contact_name: string; email: string };
      const sent = await sendMail({ to: r.email, ...(await registrationRejectedEmail({ name: r.contact_name, companyName: r.company_name, reason: reason.trim() })) });
      if (!sent.ok) console.error("[registration rejected email]", sent.error);
    }
    revalidatePath("/platform/registrations");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** Leave the company workspace and go back to the platform overview. */
export async function exitToPlatform() {
  const supabase = await ownerClient();
  const { error } = await supabase.rpc("switch_company", { p_company: null });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/platform");
}

/** Switch the owner's session into a company and open its dashboard. */
export async function enterCompany(id: string) {
  const supabase = await ownerClient();
  const { error } = await supabase.rpc("switch_company", { p_company: id });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
