import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { RecordTitle } from "@/components/modules/record-title";
import { ModuleTable } from "@/components/modules/module-table";
import { RecordsFilter } from "./records-filter";
import { HubSummary } from "./vehicle-hub";
import { isPeriod, monthRange, periodRange, yearRange } from "./periods";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getModule } from "@/modules/registry";
import { assignByDate, loadDocs, loadVehicleDocs } from "@/lib/data/docs";
import { formatDate, formatNumber, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

type Row = Record<string, unknown> & { id: string };
type Tile = { label: string; value: string; sub?: string; tone?: "danger" | "warning" };

/** Summary cards above the records, for the kinds that have them. */
function summaryFor(moduleKey: string, rows: Row[]): Tile[] | null {
  switch (moduleKey) {
    case "inspections.daily": {
      const anomalies = rows.flatMap((r) => ((r.actions as { status?: string; deleted_at?: string | null }[] | null) ?? []).filter((a) => !a.deleted_at));
      const open = anomalies.filter((a) => a.status === "open").length;
      const withAnomalies = rows.filter((r) => r.remark === "anomalies").length;
      return [
        { label: t("records.tile.inspections"), value: formatNumber(rows.length), sub: t("records.tile.no_anomalies", { count: rows.length - withAnomalies }) },
        { label: t("records.tile.anomalies"), value: formatNumber(anomalies.length), sub: t("records.tile.in_inspections", { count: withAnomalies }), tone: anomalies.length ? "warning" : undefined },
        { label: t("records.tile.actions_open"), value: formatNumber(open), sub: t("records.tile.still_to_do"), tone: open ? "danger" : undefined },
        { label: t("records.tile.actions_closed"), value: formatNumber(anomalies.length - open), sub: t("records.tile.done") },
      ];
    }
    case "daily_use.km_log": {
      const trips = rows.reduce((s, r) => s + n(r.trip_count), 0);
      const km = rows.reduce((s, r) => s + n(r.total_km), 0);
      return [
        { label: t("records.tile.trips"), value: formatNumber(trips), sub: t("records.tile.logs", { count: rows.length }) },
        { label: t("records.tile.km_run"), value: `${formatNumber(km)} km`, sub: t("records.tile.on_those_trips") },
        { label: t("records.tile.km_per_trip"), value: trips ? `${formatNumber(km / trips, 1)} km` : "—", sub: t("records.tile.average") },
        { label: t("records.tile.days_logged"), value: formatNumber(new Set(rows.map((r) => r.log_date)).size), sub: t("records.tile.in_period") },
      ];
    }
    case "daily_use.fuel_log": {
      const km = rows.reduce((s, r) => s + n(r.km_run), 0);
      const required = rows.reduce((s, r) => s + n(r.fuel_required_l), 0);
      const approved = rows.reduce((s, r) => s + n(r.approved_l), 0);
      const pending = rows.filter((r) => r.status === "submitted").length;
      return [
        { label: t("records.tile.fuel_requests"), value: formatNumber(rows.length), sub: pending ? t("records.tile.awaiting", { count: pending }) : t("records.tile.in_period"), tone: pending ? "warning" : undefined },
        { label: t("records.tile.km_run"), value: `${formatNumber(km)} km`, sub: t("records.tile.between_refills") },
        { label: t("records.tile.fuel_required"), value: `${formatNumber(required, 1)} L`, sub: t("records.tile.asked_for") },
        { label: t("records.tile.fuel_approved"), value: `${formatNumber(approved, 1)} L`, sub: km && approved ? t("records.tile.km_per_l", { value: formatNumber(km / approved, 2) }) : t("records.tile.in_period") },
      ];
    }
    default:
      return null;
  }
}

/**
 * Records of one vehicle (and one period for daily records), opened from a vehicle hub.
 * Filters change the vehicle, the period and the view; "all" shows every vehicle.
 */
export async function VehicleRecordsPage({
  moduleKey,
  searchParams,
  dateColumn,
  monthly,
  yearly = false,
  hubHref,
  hubLabel,
}: {
  moduleKey: string;
  searchParams: Record<string, string | string[] | undefined>;
  dateColumn: string;
  monthly: boolean;
  /** Records a few times a year (mobilization, third-party): filter by calendar year. */
  yearly?: boolean;
  hubHref: string;
  hubLabel: string;
}) {
  const def = getModule(moduleKey);
  const session = await requirePermission(def.resource, "view");
  const supabase = await createClient();
  const today = todayISO();

  const vehicleParam = one(searchParams.vehicle) ?? "all";
  const vehicle = /^[0-9a-f-]{36}$/i.test(vehicleParam) ? vehicleParam : null;
  // Date filter: a quick period, a month (monthly records), a year (yearly records) or From and To.
  const isDay = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const periodParam = one(searchParams.period);
  const period = isPeriod(periodParam) ? periodParam : null;
  const monthParam = one(searchParams.month);
  const month = monthly && !period && monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null;
  const yearParam = one(searchParams.year);
  const year = yearly && !period && yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  const fromParam = one(searchParams.from);
  const toParam = one(searchParams.to);
  const from = !period && !month && !year && isDay(fromParam) ? fromParam! : null;
  const to = !period && !month && !year && isDay(toParam) ? toParam! : null;
  const range = period ? periodRange(period, today) : month ? monthRange(month) : year ? yearRange(year) : from || to ? { from: from ?? "0000-01-01", to: to ?? "9999-12-31" } : null;
  const details = one(searchParams.details) === "1" && !!def.list.detailColumns;

  let query = supabase.from(def.table).select(details && def.list.detailSelect ? def.list.detailSelect : def.list.select).is("deleted_at", null);
  for (const [k, v] of Object.entries(def.list.eq ?? {})) query = query.eq(k, v);
  if (vehicle) query = query.eq("vehicle_id", vehicle);
  if (range) query = query.gte(dateColumn, range.from).lte(dateColumn, range.to);
  if (def.list.orderBy) query = query.order(def.list.orderBy.column, { ascending: def.list.orderBy.ascending ?? true });
  query = query.limit(1000);

  const [{ data, error }, { data: vehicles }] = await Promise.all([
    query,
    supabase.from("vehicles").select("id, registration, make, model").is("deleted_at", null).order("registration"),
  ]);
  const rows = ((data ?? []) as unknown as Row[]).map((r) => (def.list.derive ? { ...r, ...def.list.derive(r) } : r));

  // Attached documents, for a "docs" column (viewed in a dialog from the table).
  const shownColumns = details && def.list.detailColumns ? def.list.detailColumns : def.list.columns;
  const docsCol = shownColumns.find((c) => c.type === "docs");
  if (docsCol) {
    const docs = await loadDocs(def.table, rows.map((r) => r.id));
    for (const r of rows) r[docsCol.key] = docs.get(r.id) ?? [];
    // Reports uploaded with the vehicle go to the record of that vehicle closest before their upload date.
    if (def.list.vehicleDocLabel) {
      const byVehicle = await loadVehicleDocs([...new Set(rows.map((r) => r.vehicle_id as string))], t(def.list.vehicleDocLabel));
      for (const [vid, files] of byVehicle) {
        const mine = rows.filter((r) => r.vehicle_id === vid);
        const matched = assignByDate(mine.map((r) => ({ id: r.id, date: (r[dateColumn] as string) ?? null })), files);
        for (const r of mine) r[docsCol.key] = [...((r[docsCol.key] as unknown[]) ?? []), ...(matched.get(r.id) ?? [])];
      }
    }
  }

  // Previous record date per group (for example the vehicle's previous third-party inspection).
  const prev = def.list.previous;
  if (prev) {
    const sorted = [...rows].sort((a, b) => String(a[prev.group]).localeCompare(String(b[prev.group])) || String(a[prev.date]).localeCompare(String(b[prev.date])));
    for (let i = 0; i < sorted.length; i++) {
      const before = sorted[i - 1];
      sorted[i]![prev.as] = before && before[prev.group] === sorted[i]![prev.group] ? before[prev.date] : null;
    }
  }

  const vList = (vehicles ?? []) as { id: string; registration: string; make: string; model: string }[];
  const current = vehicle ? vList.find((v) => v.id === vehicle) : null;
  const [cy, cm] = today.split("-").map(Number) as [number, number];
  const whenLabel = period
    ? `${t(`hub.period.${period}`)} (${formatDate(range!.from)} – ${formatDate(range!.to)})`
    : month
      ? `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
      : year
        ? String(year)
        : from || to
          ? [from ? formatDate(from) : "…", to ? formatDate(to) : "…"].join(" – ")
          : t("hub.all_time");
  const title = current ? `${current.registration} · ${t(def.title)}` : t(def.title);
  const description = [current ? `${current.make} ${current.model}` : t("hub.all_vehicles"), whenLabel].filter(Boolean).join(" · ");
  const tiles = details ? null : summaryFor(def.key, rows);

  return (
    <>
      <RecordTitle title={title} />
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={hubHref}>
                <ArrowLeft /> {hubLabel}
              </Link>
            </Button>
            {session.can(def.resource, "create") ? (
              <Button asChild className="h-10">
                <Link href={`${def.path}/new${vehicle ? `?vehicle=${vehicle}` : ""}`}>
                  <Plus /> {t(def.newLabel)}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <RecordsFilter
        basePath={def.path}
        vehicles={vList.map((v) => ({ value: v.id, label: `${v.registration} (${v.make} ${v.model})`, keywords: [v.registration, v.make, v.model] }))}
        vehicle={vehicle}
        month={month}
        period={period}
        monthly={monthly}
        yearly={yearly}
        year={year}
        from={from}
        to={to}
        details={details}
        hasDetails={!!def.list.detailColumns}
        currentYear={cy}
        currentMonth={cm}
      />
      {tiles ? <HubSummary tiles={tiles} /> : null}
      {error ? <p className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error.message}</p> : null}
      <ModuleTable moduleKey={def.key} rows={rows} variant={details ? "details" : "list"} hiddenColumns={vehicle && !def.list.keepVehicleColumn ? ["vehicle.registration"] : []} dateFilter={false} />
    </>
  );
}
