import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { HeaderDates } from "@/components/shell/header-tools";
import { HubSummary, VehicleHub, type HubColumn, type HubKind, type HubVehicle } from "./vehicle-hub";
import { loadHubVehicles, num } from "./hub-data";
import { after } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rangeFromParams } from "@/lib/date-range";
import { daysFromNowISO, formatDate, formatNumber, formatTzs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

type Totals = { vehicle_id: string; records: number; trips: number; km: number; litres: number; cost: number; pending: number; first_date: string | null; last_date: string | null };

/**
 * Daily km log, fuel requests or fuel log (fuel issued): summary cards, then every vehicle with its
 * totals for the chosen dates (all time by default). A vehicle asks for the month and opens that
 * month's records for the vehicle.
 */
export async function DailyUseHub({ kind, searchParams }: { kind: "km_log" | "fuel_log" | "fuel_issues"; searchParams?: Record<string, string | string[] | undefined> }) {
  const resource = kind === "km_log" ? "daily_use.km_log" : "daily_use.fuel_log";
  await requirePermission(resource, "view");
  const range = rangeFromParams(searchParams);
  const supabase = await createClient();
  const [rows, { data: totalRows }] = await Promise.all([
    loadHubVehicles(),
    supabase.rpc("vehicle_totals", { p_kind: kind === "km_log" ? "km_log" : kind === "fuel_log" ? "fuel_requests" : "fuel_issues", p_from: range?.from ?? null, p_to: range?.to ?? null }),
  ]);
  const totals = new Map(((totalRows ?? []) as Totals[]).map((r) => [r.vehicle_id, r]));
  const sumOf = (k: keyof Pick<Totals, "records" | "trips" | "km" | "litres" | "cost" | "pending">) => [...totals.values()].reduce((s, r) => s + num(r[k]), 0);
  // Missed km logs raise in-app alerts even where the daily cron job is not set up (once a day each).
  if (kind === "km_log")
    after(async () => {
      await createAdminClient().rpc("notify_missed_km_logs");
    });
  const today = todayISO();
  const yesterday = daysFromNowISO(-1);
  const [cy, cm] = today.split("-").map(Number) as [number, number];
  const path = kind === "km_log" ? "/daily-use/km-log" : kind === "fuel_log" ? "/daily-use/fuel-requests" : "/daily-use/fuel-log";
  const when = range?.label ?? t("hub.all_time");

  const hubKind: HubKind =
    kind === "km_log"
      ? { key: "km_log", label: t("daily_use.km_log.title"), description: t("hub.kind.km_log"), icon: "gauge", path, monthly: true, table: "km_logs" }
      : kind === "fuel_log"
        ? { key: "fuel_log", label: t("daily_use.fuel.title"), description: t("hub.kind.fuel_log"), icon: "fuel", path, monthly: true, table: "fuel_requests" }
        : { key: "fuel_issues", label: t("daily_use.fuel_issues.title"), description: t("hub.kind.fuel_issues"), icon: "fuel", path, monthly: true, table: "fuel_issues" };

  const inService = rows.filter((r) => r.status === "in_service");
  const base = (r: (typeof rows)[number]) => ({ id: r.id, registration: r.registration, makeModel: `${r.make} ${r.model}`.trim(), odometerKm: r.odometer_km, status: r.status, statusReason: r.status_reason, notSafe: r.not_safe });
  let tiles: { label: string; value: string; sub?: string; tone?: "danger" | "warning" }[];
  let vehicles: HubVehicle[];
  let columns: HubColumn[];

  if (kind === "km_log") {
    const loggedToday = inService.filter((r) => r.a.last_km_log_date === today).length;
    // Missed: an in-service vehicle whose latest log is older than yesterday (yesterday was not filled in).
    const missed = (r: (typeof rows)[number]) => r.status === "in_service" && (!r.a.last_km_log_date || (r.a.last_km_log_date as string) < yesterday);
    const missedCount = inService.filter(missed).length;
    tiles = [
      { label: t("hub.tile.km_run"), value: `${formatNumber(sumOf("km"))} km`, sub: when },
      { label: t("hub.tile.trips"), value: formatNumber(sumOf("trips")), sub: t("hub.tile.logs_in", { count: sumOf("records"), when }) },
      { label: t("hub.tile.logged_today"), value: `${formatNumber(loggedToday)} / ${formatNumber(inService.length)}`, sub: t("hub.tile.in_service_vehicles") },
      { label: t("hub.tile.no_log_yesterday"), value: formatNumber(missedCount), sub: t("hub.tile.in_service_vehicles"), tone: missedCount ? "danger" : undefined },
    ];
    vehicles = rows.map((r) => {
      const last = r.a.last_km_log_date as string | null;
      const tot = totals.get(r.id);
      const late = missed(r);
      const chip: HubVehicle["chip"] = !last ? { label: t("hub.no_km_log"), tone: late ? "danger" : "neutral" } : last === today ? { label: t("hub.logged_today"), tone: "success" } : { label: t("hub.last_log", { date: formatDate(last) }), tone: late ? "danger" : "info" };
      return {
        ...base(r),
        chip,
        detail: t("hub.km_total_detail", { km: formatNumber(num(tot?.km)), trips: num(tot?.trips) }),
        cells: {
          last: last ? { chip: { label: formatDate(last), tone: late ? "danger" : last === today ? "success" : "neutral" } } : late ? { chip: { label: t("hub.no_km_log"), tone: "danger" } } : t("hub.no_km_log"),
          trips: formatNumber(num(tot?.trips)),
          km: `${formatNumber(num(tot?.km))} km`,
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "last", label: "hub.col.last_log" },
      { key: "trips", label: "hub.col.trips", align: "right" },
      { key: "km", label: "hub.col.km_run", align: "right" },
    ];
  } else if (kind === "fuel_log") {
    const pending = sumOf("pending");
    tiles = [
      { label: t("hub.tile.fuel_requests"), value: formatNumber(sumOf("records")), sub: when },
      { label: t("hub.tile.litres_requested"), value: `${formatNumber(sumOf("litres"), 1)} L`, sub: when },
      { label: t("hub.tile.km_run"), value: `${formatNumber(sumOf("km"))} km`, sub: when },
      { label: t("hub.tile.awaiting_approval"), value: formatNumber(pending), sub: t("hub.tile.fuel_requests"), tone: pending ? "warning" : undefined },
    ];
    vehicles = rows.map((r) => {
      const tot = totals.get(r.id);
      const last = (r.a.last_fuel_date as string | null) ?? null;
      const pend = num(tot?.pending);
      return {
        ...base(r),
        chip: !last ? { label: t("hub.no_fuel_request"), tone: "neutral" } : { label: t("hub.last_request", { date: formatDate(last) }), tone: last === today ? "success" : "info" },
        badge: pend > 0 ? { count: pend, label: t("hub.pending"), tone: "warning" } : null,
        detail: t("hub.fuel_requests_total_detail", { count: num(tot?.records), litres: formatNumber(num(tot?.litres), 1) }),
        cells: {
          last: last ? formatDate(last) : t("hub.no_fuel_request"),
          month: formatNumber(num(tot?.records)),
          litres: `${formatNumber(num(tot?.litres), 1)} L`,
          pending: pend > 0 ? { chip: { label: formatNumber(pend), tone: "warning" } } : "0",
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "last", label: "hub.col.last_request" },
      { key: "month", label: "hub.col.requests", align: "right" },
      { key: "litres", label: "hub.col.litres_requested", align: "right" },
      { key: "pending", label: "hub.col.awaiting", align: "right" },
    ];
  } else {
    const litres = sumOf("litres");
    const km = sumOf("km");
    tiles = [
      { label: t("hub.tile.fuel_filled"), value: `${formatNumber(litres, 1)} L`, sub: t("hub.tile.refills_in", { count: sumOf("records"), when }) },
      { label: t("hub.tile.fuel_cost"), value: formatTzs(sumOf("cost")), sub: when },
      { label: t("hub.tile.km_run"), value: `${formatNumber(km)} km`, sub: when },
      { label: t("hub.tile.consumption"), value: sumOf("trips") > 0 ? `${formatNumber(km / sumOf("trips"), 2)} km/L` : "—", sub: t("hub.tile.on_fuel_consumed", { litres: formatNumber(sumOf("trips"), 1) }) },
    ];
    vehicles = rows.map((r) => {
      const tot = totals.get(r.id);
      const last = r.a.last_issue_date as string | null;
      const l = num(tot?.litres);
      const k = num(tot?.km);
      const used = num(tot?.trips); // fuel consumed: the fills the km since were covered by
      return {
        ...base(r),
        chip: !last ? { label: t("hub.no_refuel"), tone: "neutral" } : { label: t("hub.last_refuel", { date: formatDate(last) }), tone: last === today ? "success" : "info" },
        detail: t("hub.fuel_total_detail", { litres: formatNumber(l, 1), count: num(tot?.records) }),
        cells: {
          last: last ? { chip: { label: formatDate(last), tone: last === today ? "success" : "neutral" } } : t("hub.no_refuel"),
          filled: `${formatNumber(l, 1)} L`,
          balance: r.a.last_issue_balance_l !== null && r.a.last_issue_balance_l !== undefined ? `${formatNumber(num(r.a.last_issue_balance_l), 1)} L` : null,
          km: `${formatNumber(k)} km`,
          consumed: `${formatNumber(used, 1)} L`,
          ratio: used > 0 ? `${formatNumber(k / used, 2)} km/L` : null,
          cost: formatTzs(num(tot?.cost)),
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "last", label: "hub.col.last_refill" },
      { key: "filled", label: "hub.col.fuel_filled_total", align: "right" },
      { key: "balance", label: "hub.col.fuel_balance", align: "right" },
      { key: "km", label: "hub.col.km_run", align: "right" },
      { key: "consumed", label: "hub.col.fuel_consumed", align: "right" },
      { key: "ratio", label: "hub.col.consumption", align: "right" },
      { key: "cost", label: "hub.col.fuel_cost", align: "right" },
    ];
  }

  return (
    <>
      <PageHeader
        title={hubKind.label}
        description={t(kind === "km_log" ? "hub.km_description" : kind === "fuel_log" ? "hub.fuel_requests_description" : "hub.fuel_description")}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={`${path}?vehicle=all`}>{t("hub.all_records")}</Link>
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

/** The date filter of a page's summary cards and totals, with what it is showing. */
export function SummaryDates({ label }: { label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <HeaderDates />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
