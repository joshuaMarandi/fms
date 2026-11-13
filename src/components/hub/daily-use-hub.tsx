import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { HubSummary, VehicleHub, type HubColumn, type HubKind, type HubVehicle } from "./vehicle-hub";
import { loadHubVehicles, num } from "./hub-data";
import { requirePermission } from "@/lib/auth/session";
import { daysFromNowISO, formatDate, formatNumber, formatTzs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * Daily km log or fuel log: summary, then every vehicle. A vehicle asks for the month and opens
 * that month's records for the vehicle.
 */
export async function DailyUseHub({ kind }: { kind: "km_log" | "fuel_log" }) {
  const resource = kind === "km_log" ? "daily_use.km_log" : "daily_use.fuel_log";
  const session = await requirePermission(resource, "view");
  const rows = await loadHubVehicles();
  const today = todayISO();
  const weekAgo = daysFromNowISO(-7);
  const [cy, cm] = today.split("-").map(Number) as [number, number];
  const path = kind === "km_log" ? "/daily-use/km-log" : "/daily-use/fuel-log";

  const hubKind: HubKind =
    kind === "km_log"
      ? { key: "km_log", label: t("daily_use.km_log.title"), description: t("hub.kind.km_log"), icon: "gauge", path, monthly: true, table: "km_logs" }
      : { key: "fuel_log", label: t("daily_use.fuel.title"), description: t("hub.kind.fuel_log"), icon: "fuel", path, monthly: true, table: "fuel_requests" };

  const inService = rows.filter((r) => r.status === "in_service");
  let tiles: { label: string; value: string; sub?: string; tone?: "danger" | "warning" }[];
  let vehicles: HubVehicle[];
  let columns: HubColumn[];
  let listNote: string;

  if (kind === "km_log") {
    const loggedToday = inService.filter((r) => r.a.last_km_log_date === today).length;
    const idle = inService.filter((r) => !r.a.last_km_log_date || (r.a.last_km_log_date as string) < weekAgo).length;
    tiles = [
      { label: t("hub.tile.km_month"), value: `${formatNumber(rows.reduce((s, r) => s + num(r.a.km_this_month), 0))} km`, sub: t("hub.tile.all_vehicles") },
      { label: t("hub.tile.trips_month"), value: formatNumber(rows.reduce((s, r) => s + num(r.a.trips_this_month), 0)), sub: t("hub.tile.logs_month", { count: rows.reduce((s, r) => s + num(r.a.km_logs_this_month), 0) }) },
      { label: t("hub.tile.logged_today"), value: `${formatNumber(loggedToday)} / ${formatNumber(inService.length)}`, sub: t("hub.tile.in_service_vehicles") },
      { label: t("hub.tile.no_log_7"), value: formatNumber(idle), sub: t("hub.tile.in_service_vehicles"), tone: idle ? "warning" : undefined },
    ];
    vehicles = rows.map((r) => {
      const last = r.a.last_km_log_date as string | null;
      const chip: HubVehicle["chip"] = !last ? { label: t("hub.no_km_log"), tone: "neutral" } : last === today ? { label: t("hub.logged_today"), tone: "success" } : { label: t("hub.last_log", { date: formatDate(last) }), tone: last < weekAgo ? "warning" : "info" };
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
          last: last ? { chip: { label: formatDate(last), tone: last === today ? "success" : last < weekAgo ? "warning" : "neutral" } } : t("hub.no_km_log"),
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
  } else {
    const litres = rows.reduce((s, r) => s + num(r.a.fuel_l_this_month), 0);
    const km = rows.reduce((s, r) => s + num(r.a.fuel_km_this_month), 0);
    const pending = rows.reduce((s, r) => s + num(r.a.fuel_pending), 0);
    tiles = [
      { label: t("hub.tile.fuel_month"), value: `${formatNumber(litres, 1)} L`, sub: t("hub.tile.fuel_requests_month", { count: rows.reduce((s, r) => s + num(r.a.fuel_requests_this_month), 0) }) },
      { label: t("hub.tile.fuel_cost_month"), value: formatTzs(rows.reduce((s, r) => s + num(r.a.fuel_cost_this_month), 0)), sub: t("hub.tile.all_vehicles") },
      { label: t("hub.tile.consumption"), value: litres > 0 ? `${formatNumber(km / litres, 2)} km/L` : "—", sub: t("hub.tile.this_month") },
      { label: t("hub.tile.awaiting_approval"), value: formatNumber(pending), sub: t("hub.tile.fuel_requests"), tone: pending ? "warning" : undefined },
    ];
    vehicles = rows.map((r) => {
      const last = r.a.last_fuel_date as string | null;
      const pend = num(r.a.fuel_pending);
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
        badge: pend > 0 ? { count: pend, label: t("hub.pending"), tone: "warning" } : null,
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
        description={t(kind === "km_log" ? "hub.km_description" : "hub.fuel_description")}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={`${path}?vehicle=all&month=${today.slice(0, 7)}`}>{t("hub.all_records")}</Link>
            </Button>
            {session.can(resource, "create") ? (
              <Button asChild className="h-10">
                <Link href={`${path}/new`}>
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
