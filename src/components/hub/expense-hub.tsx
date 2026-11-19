import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { HubSummary, VehicleHub, type HubColumn, type HubKind, type HubVehicle } from "./vehicle-hub";
import { SummaryDates } from "./daily-use-hub";
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
  const when = range?.label ?? t("hub.all_time");
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
      { label: t("expenses.hub.fuel_amount"), value: formatTzs(sum("cost")), sub: when },
      { label: t("expenses.hub.fuel_consumed"), value: `${formatNumber(litres, 1)} L`, sub: t("expenses.hub.records_in", { count: sum("records"), when }) },
      { label: t("hub.tile.km_run"), value: `${formatNumber(km)} km`, sub: when },
      { label: t("hub.tile.consumption"), value: litres > 0 ? `${formatNumber(km / litres, 2)} km/L` : "—", sub: when },
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
  } else {
    const both = kind === "maintenance_records";
    tiles = [
      { label: t("expenses.hub.total_cost"), value: formatTzs(sum("cost")), sub: when },
      { label: t("expenses.hub.records"), value: formatNumber(sum("records")), sub: when },
      ...(both
        ? [
            { label: t("expenses.hub.maintenance_part"), value: formatTzs(sum("litres")), sub: when },
            { label: t("expenses.hub.repair_part"), value: formatTzs(sum("trips")), sub: when },
          ]
        : [{ label: t("expenses.hub.vehicles_with"), value: formatNumber([...totals.values()].filter((x) => num(x.records) > 0).length), sub: when }]),
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
          maintenance: formatTzs(num(tot?.litres)),
          repairs: formatTzs(num(tot?.trips)),
          total: formatTzs(num(tot?.cost)),
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "last", label: "expenses.hub.last_date" },
      { key: "records", label: "expenses.hub.records", align: "right" },
      ...(both
        ? [
            { key: "maintenance", label: "expenses.hub.maintenance_part", align: "right" as const },
            { key: "repairs", label: "expenses.hub.repair_part", align: "right" as const },
          ]
        : []),
      { key: "total", label: "expenses.hub.total_cost", align: "right" },
    ];
  }

  const hubKind: HubKind = { key: kind, label: t(k.title), description: t(k.description), icon: k.icon, path: k.path, monthly: true, table: k.table };

  return (
    <>
      <PageHeader
        title={t(k.title)}
        description={t(k.description)}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={`${k.path}?vehicle=all`}>{t("hub.all_records")}</Link>
            </Button>
          </>
        }
      />
      <SummaryDates label={when} />
      <HubSummary tiles={tiles} />
      <VehicleHub vehicles={vehicles} kinds={[hubKind]} currentYear={cy} currentMonth={cm} columns={columns} listNote={t("hub.list_note_totals", { when })} />
    </>
  );
}
