import { PageHeader } from "@/components/shell/page-header";
import { HubSummary, VehicleHub, type HubColumn, type HubKind, type HubVehicle } from "./vehicle-hub";
import { ViewAllMenu } from "./view-all-menu";
import { HeaderDates } from "@/components/shell/header-tools";
import { loadHubVehicles, num } from "./hub-data";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rangeFromParams } from "@/lib/date-range";
import { formatDate, formatNumber, formatTzs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

type Totals = { vehicle_id: string; records: number; trips: number; km: number; litres: number; cost: number; first_date: string | null; last_date: string | null };
export type ExpenseKind = "fuel_cost" | "maintenance_records" | "maintenance_cost" | "repair_cost";

const KINDS: Record<ExpenseKind, { rpc: string; resource: string; path: string; title: string; description: string; newLabel: string; table: string; icon: string }> = {
  fuel_cost: { rpc: "fuel_expenses", resource: "expenses.fuel", path: "/expenses/fuel", title: "expenses.fuel.title", description: "expenses.fuel.description", newLabel: "expenses.fuel.new", table: "fuel_expenses", icon: "fuel" },
  maintenance_records: { rpc: "maintenance_costs", resource: "expenses.maintenance.costs", path: "/expenses/maintenance/costs", title: "expenses.maintenance.costs.title", description: "expenses.maintenance.costs.description", newLabel: "expenses.maintenance.costs.new", table: "maintenance_costs", icon: "wrench" },
  maintenance_cost: { rpc: "maintenance_only", resource: "expenses.maintenance.costs", path: "/expenses/maintenance-cost", title: "expenses.maintenance_cost.title", description: "expenses.maintenance_cost.description", newLabel: "expenses.maintenance.costs.new", table: "maintenance_costs", icon: "wrench" },
  repair_cost: { rpc: "repairs_only", resource: "expenses.maintenance.costs", path: "/expenses/repair-cost", title: "expenses.repair_cost.title", description: "expenses.repair_cost.description", newLabel: "expenses.maintenance.costs.new", table: "maintenance_costs", icon: "wrench" },
};

/**
 * Fuel cost and maintenance and repair costs in the same layout as the fuel log: summary cards and
 * every vehicle with its totals for the chosen dates (all time by default). A vehicle opens its
 * months; a month opens that vehicle's records with their own summary.
 */
export async function ExpenseHub({ kind, searchParams }: { kind: ExpenseKind; searchParams?: Record<string, string | string[] | undefined> }) {
  const k = KINDS[kind];
  await requirePermission(k.resource, "view");
  const range = rangeFromParams(searchParams);
  const supabase = await createClient();
  const [rows, { data: totalRows }] = await Promise.all([loadHubVehicles(), supabase.rpc("vehicle_totals", { p_kind: k.rpc, p_from: range?.from ?? null, p_to: range?.to ?? null })]);
  const totals = new Map(((totalRows ?? []) as Totals[]).map((r) => [r.vehicle_id, r]));
  const sum = (key: "records" | "km" | "litres" | "cost" | "trips") => [...totals.values()].reduce((s, r) => s + num(r[key]), 0);
  const today = todayISO();
  const [cy, cm] = today.split("-").map(Number) as [number, number];
  const base = (r: (typeof rows)[number]) => ({ id: r.id, registration: r.registration, makeModel: `${r.make} ${r.model}`.trim(), odometerKm: r.odometer_km, status: r.status, statusReason: r.status_reason, notSafe: r.not_safe });

  let tiles: { label: string; value: string; sub?: string; tone?: "danger" | "warning" }[];
  let columns: HubColumn[];
  let vehicles: HubVehicle[];

  if (kind === "fuel_cost") {
    const km = sum("km");
    const litres = sum("litres");
    tiles = [
      { label: t("expenses.hub.fuel_amount"), value: formatTzs(sum("cost")) },
      { label: t("expenses.hub.fuel_consumed"), value: `${formatNumber(litres, 1)} L`, sub: t("expenses.hub.records_count", { count: sum("records") }) },
      { label: t("hub.tile.km_run"), value: `${formatNumber(km)} km` },
      { label: t("hub.tile.consumption"), value: litres > 0 ? `${formatNumber(km / litres, 2)} km/L` : "—" },
    ];
    vehicles = rows.map((r) => {
      const tot = totals.get(r.id);
      const l = num(tot?.litres);
      const kmRun = num(tot?.km);
      return {
        ...base(r),
        chip: tot?.last_date ? { label: t("expenses.hub.last_record", { date: formatDate(tot.last_date) }), tone: "info" } : { label: t("expenses.hub.no_records"), tone: "neutral" },
        detail: t("expenses.hub.fuel_detail", { amount: formatTzs(num(tot?.cost)), litres: formatNumber(l, 1) }),
        cells: {
          last: tot?.last_date ? formatDate(tot.last_date) : t("expenses.hub.no_records"),
          km: `${formatNumber(kmRun)} km`,
          litres: `${formatNumber(l, 1)} L`,
          ratio: l > 0 ? `${formatNumber(kmRun / l, 2)} km/L` : null,
          amount: formatTzs(num(tot?.cost)),
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "last", label: "expenses.hub.last_date" },
      { key: "km", label: "hub.col.km_run", align: "right" },
      { key: "litres", label: "hub.col.fuel_consumed", align: "right" },
      { key: "ratio", label: "hub.col.consumption", align: "right" },
      { key: "amount", label: "expenses.hub.amount", align: "right" },
    ];
  } else if (kind === "maintenance_records") {
    // PM (preventive maintenance) and CR (corrective repair) per vehicle, for the chosen dates.
    let q = supabase.from("maintenance_costs").select("vehicle_id, work_type, cost_date, cost_tzs").is("deleted_at", null);
    if (range) q = q.gte("cost_date", range.from).lte("cost_date", range.to);
    const { data: recs } = await q.limit(20000);
    type Side = { count: number; last: string | null; cost: number };
    const per = new Map<string, { pm: Side; cr: Side }>();
    for (const r of (recs ?? []) as { vehicle_id: string; work_type: string; cost_date: string; cost_tzs: number | null }[]) {
      const p = per.get(r.vehicle_id) ?? { pm: { count: 0, last: null, cost: 0 }, cr: { count: 0, last: null, cost: 0 } };
      const side = r.work_type === "repairs" ? p.cr : p.pm;
      side.count++;
      side.cost += num(r.cost_tzs);
      if (!side.last || r.cost_date > side.last) side.last = r.cost_date;
      per.set(r.vehicle_id, p);
    }
    const all = [...per.values()];
    const total = (pick: (x: { pm: Side; cr: Side }) => number) => all.reduce((s, x) => s + pick(x), 0);
    tiles = [
      { label: t("maint.pm_records"), value: formatNumber(total((x) => x.pm.count)) },
      { label: t("maint.cr_records"), value: formatNumber(total((x) => x.cr.count)) },
      { label: t("maint.pm_cost"), value: formatTzs(total((x) => x.pm.cost)) },
      { label: t("maint.cr_cost"), value: formatTzs(total((x) => x.cr.cost)) },
    ];
    vehicles = rows.map((r) => {
      const p = per.get(r.id);
      const last = [p?.pm.last, p?.cr.last].filter((d): d is string => !!d).sort().pop();
      return {
        ...base(r),
        chip: last ? { label: t("expenses.hub.last_record", { date: formatDate(last) }), tone: "info" } : { label: t("expenses.hub.no_records"), tone: "neutral" },
        detail: t("maint.detail", { pm: p?.pm.count ?? 0, cr: p?.cr.count ?? 0, amount: formatTzs((p?.pm.cost ?? 0) + (p?.cr.cost ?? 0)) }),
        cells: {
          pm: formatNumber(p?.pm.count ?? 0),
          cr: formatNumber(p?.cr.count ?? 0),
          last_pm: p?.pm.last ? formatDate(p.pm.last) : "—",
          last_cr: p?.cr.last ? formatDate(p.cr.last) : "—",
          pm_cost: formatTzs(p?.pm.cost ?? 0),
          cr_cost: formatTzs(p?.cr.cost ?? 0),
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "pm", label: "maint.col.pm", align: "right" },
      { key: "cr", label: "maint.col.cr", align: "right" },
      { key: "last_pm", label: "maint.col.last_pm" },
      { key: "last_cr", label: "maint.col.last_cr" },
      { key: "pm_cost", label: "maint.col.pm_cost", align: "right" },
      { key: "cr_cost", label: "maint.col.cr_cost", align: "right" },
    ];
  } else {
    tiles = [
      { label: t("expenses.hub.total_cost"), value: formatTzs(sum("cost")) },
      { label: t("expenses.hub.records"), value: formatNumber(sum("records")) },
      { label: t("expenses.hub.vehicles_with"), value: formatNumber([...totals.values()].filter((x) => num(x.records) > 0).length) },
    ];
    vehicles = rows.map((r) => {
      const tot = totals.get(r.id);
      return {
        ...base(r),
        chip: tot?.last_date ? { label: t("expenses.hub.last_record", { date: formatDate(tot.last_date) }), tone: "info" } : { label: t("expenses.hub.no_records"), tone: "neutral" },
        detail: t("expenses.hub.cost_detail", { amount: formatTzs(num(tot?.cost)), count: num(tot?.records) }),
        cells: {
          last: tot?.last_date ? formatDate(tot.last_date) : t("expenses.hub.no_records"),
          records: formatNumber(num(tot?.records)),
          total: formatTzs(num(tot?.cost)),
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "last", label: "expenses.hub.last_date" },
      { key: "records", label: "expenses.hub.records", align: "right" },
      { key: "total", label: "expenses.hub.total_cost", align: "right" },
    ];
  }

  const hubKind: HubKind = { key: kind, label: t(k.title), description: t(k.description), icon: k.icon, path: k.path, monthly: true, table: k.table };

  return (
    <>
      <PageHeader
        title={t(k.title)}
        description={t(k.description)}
      />
      <ViewAllMenu items={[{ href: `${k.path}?vehicle=all`, label: t(k.title) }]} />
      <HeaderDates />
      <HubSummary tiles={tiles} />
      <VehicleHub vehicles={vehicles} kinds={[hubKind]} currentYear={cy} currentMonth={cm} columns={columns} />
    </>
  );
}
