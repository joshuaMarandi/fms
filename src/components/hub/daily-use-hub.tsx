import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { HubSummary, VehicleHub, type HubColumn, type HubKind, type HubVehicle } from "./vehicle-hub";
import { loadHubVehicles, num } from "./hub-data";
import { after } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysFromNowISO, formatDate, formatNumber, formatTzs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * Daily km log, fuel requests or fuel log (fuel issued): summary, then every vehicle. A vehicle
 * asks for the month and opens that month's records for the vehicle.
 */
export async function DailyUseHub({ kind }: { kind: "km_log" | "fuel_log" | "fuel_issues" }) {
  const resource = kind === "km_log" ? "daily_use.km_log" : "daily_use.fuel_log";
  const session = await requirePermission(resource, "view");
  const rows = await loadHubVehicles();
  // Missed km logs raise in-app alerts even where the daily cron job is not set up (once a day each).
  if (kind === "km_log")
    after(async () => {
      await createAdminClient().rpc("notify_missed_km_logs");
    });
  const today = todayISO();
  const yesterday = daysFromNowISO(-1);
  const [cy, cm] = today.split("-").map(Number) as [number, number];
  const path = kind === "km_log" ? "/daily-use/km-log" : kind === "fuel_log" ? "/daily-use/fuel-requests" : "/daily-use/fuel-log";

  const hubKind: HubKind =
    kind === "km_log"
      ? { key: "km_log", label: t("daily_use.km_log.title"), description: t("hub.kind.km_log"), icon: "gauge", path, monthly: true, table: "km_logs" }
      : kind === "fuel_log"
        ? { key: "fuel_log", label: t("daily_use.fuel.title"), description: t("hub.kind.fuel_log"), icon: "fuel", path, monthly: true, table: "fuel_requests" }
        : { key: "fuel_issues", label: t("daily_use.fuel_issues.title"), description: t("hub.kind.fuel_issues"), icon: "fuel", path, monthly: true, table: "fuel_issues" };

  const inService = rows.filter((r) => r.status === "in_service");
  let tiles: { label: string; value: string; sub?: string; tone?: "danger" | "warning" }[];
  let vehicles: HubVehicle[];
  let columns: HubColumn[];
  let listNote: string;

  if (kind === "km_log") {
    const loggedToday = inService.filter((r) => r.a.last_km_log_date === today).length;
    // Missed: an in-service vehicle whose latest log is older than yesterday (yesterday was not filled in).
    const missed = (r: (typeof rows)[number]) => r.status === "in_service" && (!r.a.last_km_log_date || (r.a.last_km_log_date as string) < yesterday);
    const missedCount = inService.filter(missed).length;
    tiles = [
      { label: t("hub.tile.km_month"), value: `${formatNumber(rows.reduce((s, r) => s + num(r.a.km_this_month), 0))} km`, sub: t("hub.tile.all_vehicles") },
      { label: t("hub.tile.trips_month"), value: formatNumber(rows.reduce((s, r) => s + num(r.a.trips_this_month), 0)), sub: t("hub.tile.logs_month", { count: rows.reduce((s, r) => s + num(r.a.km_logs_this_month), 0) }) },
      { label: t("hub.tile.logged_today"), value: `${formatNumber(loggedToday)} / ${formatNumber(inService.length)}`, sub: t("hub.tile.in_service_vehicles") },
      { label: t("hub.tile.no_log_yesterday"), value: formatNumber(missedCount), sub: t("hub.tile.in_service_vehicles"), tone: missedCount ? "danger" : undefined },
    ];
    vehicles = rows.map((r) => {
      const last = r.a.last_km_log_date as string | null;
      const late = missed(r);
      const chip: HubVehicle["chip"] = !last ? { label: t("hub.no_km_log"), tone: late ? "danger" : "neutral" } : last === today ? { label: t("hub.logged_today"), tone: "success" } : { label: t("hub.last_log", { date: formatDate(last) }), tone: late ? "danger" : "info" };
      return {
        id: r.id,
        registration: r.registration,
        makeModel: `${r.make} ${r.model}`.trim(),
        odometerKm: r.odometer_km,
        status: r.status,
        statusReason: r.status_reason,
        notSafe: r.not_safe,
        chip,
        detail: t("hub.km_month_detail", { km: formatNumber(num(r.a.km_this_month)), trips: num(r.a.trips_this_month) }),
        cells: {
          last: last ? { chip: { label: formatDate(last), tone: late ? "danger" : last === today ? "success" : "neutral" } } : late ? { chip: { label: t("hub.no_km_log"), tone: "danger" } } : t("hub.no_km_log"),
          trips: formatNumber(num(r.a.trips_this_month)),
          km: `${formatNumber(num(r.a.km_this_month))} km`,
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
    listNote = t("hub.list_note_month");
  } else if (kind === "fuel_log") {
    const pending = rows.reduce((s, r) => s + num(r.a.fuel_pending), 0);
    tiles = [
      { label: t("hub.tile.fuel_requests"), value: formatNumber(rows.reduce((s, r) => s + num(r.a.fuel_requests_this_month), 0)), sub: t("hub.tile.this_month") },
      { label: t("hub.tile.awaiting_approval"), value: formatNumber(pending), sub: t("hub.tile.fuel_requests"), tone: pending ? "warning" : undefined },
    ];
    vehicles = rows.map((r) => {
      const last = r.a.last_fuel_date as string | null;
      const pend = num(r.a.fuel_pending);
      return {
        id: r.id,
        registration: r.registration,
        makeModel: `${r.make} ${r.model}`.trim(),
        odometerKm: r.odometer_km,
        status: r.status,
        statusReason: r.status_reason,
        notSafe: r.not_safe,
        chip: !last ? { label: t("hub.no_fuel_request"), tone: "neutral" } : { label: t("hub.last_request", { date: formatDate(last) }), tone: last === today ? "success" : "info" },
        badge: pend > 0 ? { count: pend, label: t("hub.pending"), tone: "warning" } : null,
        detail: t("hub.fuel_requests_detail", { count: num(r.a.fuel_requests_this_month) }),
        cells: {
          last: last ? formatDate(last) : t("hub.no_fuel_request"),
          month: formatNumber(num(r.a.fuel_requests_this_month)),
          pending: pend > 0 ? { chip: { label: formatNumber(pend), tone: "warning" } } : "0",
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "last", label: "hub.col.last_request" },
      { key: "month", label: "hub.col.requests_month", align: "right" },
      { key: "pending", label: "hub.col.awaiting", align: "right" },
    ];
    listNote = t("hub.list_note_month");
  } else {
    const litres = rows.reduce((s, r) => s + num(r.a.fuel_l_this_month), 0);
    const km = rows.reduce((s, r) => s + num(r.a.fuel_km_this_month), 0);
    tiles = [
      { label: t("hub.tile.fuel_month"), value: `${formatNumber(litres, 1)} L`, sub: t("hub.tile.fuel_requests_month", { count: rows.reduce((s, r) => s + num(r.a.fuel_requests_this_month), 0) }) },
      { label: t("hub.tile.fuel_cost_month"), value: formatTzs(rows.reduce((s, r) => s + num(r.a.fuel_cost_this_month), 0)), sub: t("hub.tile.all_vehicles") },
      { label: t("hub.tile.consumption"), value: litres > 0 ? `${formatNumber(km / litres, 2)} km/L` : "—", sub: t("hub.tile.this_month") },
    ];
    vehicles = rows.map((r) => {
      const last = r.a.last_issue_date as string | null;
      const chip: HubVehicle["chip"] = !last ? { label: t("hub.no_refuel"), tone: "neutral" } : { label: t("hub.last_refuel", { date: formatDate(last) }), tone: last === today ? "success" : "info" };
      return {
        id: r.id,
        registration: r.registration,
        makeModel: `${r.make} ${r.model}`.trim(),
        odometerKm: r.odometer_km,
        status: r.status,
        statusReason: r.status_reason,
        notSafe: r.not_safe,
        chip,
        detail: t("hub.fuel_month_detail", { litres: formatNumber(num(r.a.fuel_l_this_month), 1) }),
        cells: {
          last: r.a.last_issue_date ? { chip: { label: formatDate(r.a.last_issue_date as string), tone: r.a.last_issue_date === today ? "success" : "neutral" } } : last ? formatDate(last) : t("hub.no_refuel"),
          filled: r.a.last_issue_l !== null && r.a.last_issue_l !== undefined ? `${formatNumber(num(r.a.last_issue_l), 1)} L` : null,
          balance: r.a.last_issue_balance_l !== null && r.a.last_issue_balance_l !== undefined ? `${formatNumber(num(r.a.last_issue_balance_l), 1)} L` : null,
          km: r.a.last_issue_km_run !== null && r.a.last_issue_km_run !== undefined ? `${formatNumber(num(r.a.last_issue_km_run))} km` : null,
        },
      };
    });
    columns = [
      { key: "registration", label: "fleet.reg" },
      { key: "makeModel", label: "fleet.make_model" },
      { key: "last", label: "hub.col.last_refill" },
      { key: "filled", label: "hub.col.fuel_filled", align: "right" },
      { key: "balance", label: "hub.col.fuel_balance", align: "right" },
      { key: "km", label: "hub.col.km_run", align: "right" },
    ];
    listNote = t("hub.list_note_last_refill");
  }

  return (
    <>
      <PageHeader
        title={hubKind.label}
        description={t(kind === "km_log" ? "hub.km_description" : kind === "fuel_log" ? "hub.fuel_requests_description" : "hub.fuel_description")}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={`${path}?vehicle=all&month=${today.slice(0, 7)}`}>{t("hub.all_records")}</Link>
            </Button>
            {session.can(resource, "create") ? (
              <Button asChild className="h-10">
                <Link href={kind === "km_log" ? `${path}/new` : "/daily-use/fuel-requests/new"}>
                  <Plus /> {t(kind === "km_log" ? "daily_use.km_log.new" : "daily_use.fuel.new")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <HubSummary tiles={tiles} />
      <VehicleHub vehicles={vehicles} kinds={[hubKind]} currentYear={cy} currentMonth={cm} columns={columns} listNote={listNote} />
    </>
  );
}
