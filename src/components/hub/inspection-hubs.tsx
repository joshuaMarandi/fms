import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { HubSummary, VehicleHub, type HubCell, type HubColumn, type HubKind, type HubVehicle } from "./vehicle-hub";
import { AddMenu, ViewAllMenu } from "./view-all-menu";
import { loadHubVehicles, num, type HubRow } from "./hub-data";
import { requirePermission, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { daysFromNowISO, formatDate, formatNumber, todayISO } from "@/lib/utils";
import { SummaryDates } from "./daily-use-hub";
import { rangeFromParams } from "@/lib/date-range";
import { t } from "@/i18n";

/** One row of v_vehicle_inspection_summary. */
export type InspectionSummary = {
  vehicle_id: string;
  added_on: string | null;
  daily_dates: string[] | null;
  daily_last: string | null;
  daily_open: number;
  daily_closed: number;
  mobilization_last: string | null;
  mobilization_next: string | null;
  third_party_last: string | null;
  third_party_next: string | null;
  third_party_open: number;
  weekly_dates: string[] | null;
  weekly_last: string | null;
  weekly_open: number;
  weekly_closed: number;
};

export async function loadInspectionSummary(): Promise<Map<string, InspectionSummary>> {
  const supabase = await createClient();
  const { data } = await supabase.from("v_vehicle_inspection_summary").select("*");
  return new Map(((data ?? []) as InspectionSummary[]).map((r) => [r.vehicle_id, r]));
}

const SKIP_WINDOW = 30;
const dayMs = 86400000;
const toDay = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Days in the last 30 (up to yesterday; today still has time) with no daily inspection, counted
 * from the day the vehicle was added when that is later.
 */
export function skippedDays(s: InspectionSummary | undefined, today: string): number {
  const end = toDay(today) - dayMs;
  let start = toDay(today) - SKIP_WINDOW * dayMs;
  if (s?.added_on) start = Math.max(start, toDay(s.added_on));
  const done = new Set(s?.daily_dates ?? []);
  let missed = 0;
  for (let d = start; d <= end; d += dayMs) if (!done.has(fromDay(d))) missed++;
  return missed;
}

/** A due-date chip: overdue in red, within 30 days in amber, later in green. */
function dueCell(date: string | null, today: string, in30: string): HubCell {
  if (!date) return t("hub.not_due");
  return { chip: { label: formatDate(date), tone: date < today ? "danger" : date <= in30 ? "warning" : "success" } };
}

function base(r: HubRow) {
  return {
    id: r.id,
    registration: r.registration,
    makeModel: `${r.make} ${r.model}`.trim(),
    odometerKm: r.odometer_km,
    status: r.status,
    statusReason: r.status_reason,
    notSafe: r.not_safe,
  };
}

function BackToInspections() {
  return (
    <Button asChild variant="outline" className="h-10">
      <Link href="/inspections">
        <ArrowLeft /> {t("inspections.title")}
      </Link>
    </Button>
  );
}

const DAILY_COLUMNS: HubColumn[] = [
  { key: "registration", label: "fleet.reg" },
  { key: "makeModel", label: "fleet.make_model" },
  { key: "last", label: "hub.col.last_inspection_at" },
  { key: "count", label: "hub.col.inspections", align: "right" },
  { key: "actions", label: "hub.col.actions" },
  { key: "status", label: "common.status" },
];

/** Daily pre-start inspections: every vehicle with its last inspection, actions and skipped days. */
export async function DailyInspectionHub({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> } = {}) {
  const range = rangeFromParams(searchParams);
  const when = range?.label ?? t("hub.all_time");
  const session = await requirePermission("inspections.daily", "view");
  if (session.platformMode) redirect("/platform");
  const supabase = await createClient();
  let countQuery = supabase.from("daily_inspections").select("vehicle_id").eq("frequency", "daily").is("deleted_at", null).limit(20000);
  if (range) countQuery = countQuery.gte("inspection_date", range.from).lte("inspection_date", range.to);
  const [rows, summary, { data: inspectedRows }] = await Promise.all([loadHubVehicles(), loadInspectionSummary(), countQuery]);
  // Inspections per vehicle for the chosen dates (all time by default).
  const inspections = new Map<string, number>();
  for (const r of (inspectedRows ?? []) as { vehicle_id: string }[]) inspections.set(r.vehicle_id, (inspections.get(r.vehicle_id) ?? 0) + 1);
  const today = todayISO();
  const [cy, cm] = today.split("-").map(Number) as [number, number];

  const inService = rows.filter((r) => r.status === "in_service");
  const inspectedToday = inService.filter((r) => summary.get(r.id)?.daily_last === today).length;
  const skippedBy = new Map(rows.map((r) => [r.id, r.status === "in_service" ? skippedDays(summary.get(r.id), today) : 0]));
  const openActions = rows.reduce((sum, r) => sum + num(summary.get(r.id)?.daily_open), 0);
  const skippedVehicles = [...skippedBy.values()].filter((n) => n > 0).length;

  const vehicles: HubVehicle[] = rows.map((r) => {
    const s = summary.get(r.id);
    const last = s?.daily_last ?? null;
    const open = num(s?.daily_open);
    const closed = num(s?.daily_closed);
    const skipped = skippedBy.get(r.id) ?? 0;

    let chip: HubVehicle["chip"];
    if (r.status !== "in_service") chip = { label: t("status.out_of_service"), tone: "neutral" };
    else if (skipped > 0) chip = { label: skipped === 1 ? t("hub.skipped_one") : t("hub.skipped_many", { count: skipped }), tone: "danger" };
    else if (last === today) chip = { label: t("hub.inspected_today"), tone: "success" };
    else chip = { label: t("hub.inspected_every_day"), tone: "success" };

    const actions: HubCell = open + closed === 0 ? t("hub.no_actions") : { chip: { label: t("hub.actions_counts", { open, closed }), tone: open > 0 ? (r.not_safe ? "danger" : "warning") : "success" } };
    // Out of service and not-safe vehicles keep the vehicle status; the rest show skipped days.
    const status: HubCell | undefined = r.status !== "in_service" || r.not_safe ? undefined : { chip };
    return {
      ...base(r),
      chip,
      badge: open > 0 ? { count: open, label: open === 1 ? t("hub.open_action") : t("hub.open_actions"), tone: r.not_safe ? "danger" : "warning" } : null,
      detail: last ? t("hub.last_inspected", { date: formatDate(last) }) : t("hub.not_yet_inspected"),
      cells: {
        last: last ? { chip: { label: formatDate(last), tone: last === today ? "success" : "neutral" } } : t("hub.not_yet_inspected"),
        count: formatNumber(inspections.get(r.id) ?? 0),
        actions,
        ...(status ? { status } : {}),
      },
    };
  });

  const kinds: HubKind[] = [{ key: "daily", label: t("inspections.daily.short_title"), description: t("hub.kind.daily"), icon: "sun", path: "/inspections/daily", monthly: true, table: "daily_inspections" }];

  return (
    <>
      <PageHeader
        title={t("inspections.daily.short_title")}
        actions={
          <>
            <BackToInspections />
            {session.can("inspections", "view") ? (
              <Button asChild variant="outline" className="h-10">
                <Link href="/inspections/anomalies">
                  <AlertTriangle /> {t("hub.open_actions_title")}
                </Link>
              </Button>
            ) : null}
            <ViewAllMenu items={[{ href: "/inspections/daily?vehicle=all&details=1", label: t("inspections.daily.short_title") }]} />
            <AddMenu items={session.can("inspections.daily", "create") ? [{ href: "/inspections/daily/new", label: t("inspections.daily.short_title") }] : []} label={t("inspections.add")} />
          </>
        }
      />
      <SummaryDates label={when} />
      <HubSummary
        tiles={[
          { label: t("hub.tile.inspections"), value: formatNumber([...inspections.values()].reduce((a, b) => a + b, 0)), sub: when },
          { label: t("hub.tile.inspected_today"), value: `${formatNumber(inspectedToday)} / ${formatNumber(inService.length)}`, sub: t("hub.tile.in_service_vehicles") },
          { label: t("hub.tile.skipped"), value: formatNumber(skippedVehicles), sub: skippedVehicles ? t("hub.tile.vehicles_skipped", { count: skippedVehicles }) : t("hub.tile.none_skipped"), tone: skippedVehicles ? "danger" : undefined },
          { label: t("hub.open_actions_title"), value: formatNumber(openActions), sub: t("hub.tile.daily_inspections"), tone: openActions ? "warning" : undefined, href: "/inspections/anomalies" },
        ]}
      />
      <VehicleHub vehicles={vehicles} kinds={kinds} currentYear={cy} currentMonth={cm} columns={DAILY_COLUMNS} listNote={t("hub.list_note.skipped")} />
    </>
  );
}

const YEARLY_COLUMNS: HubColumn[] = [
  { key: "registration", label: "fleet.reg" },
  { key: "makeModel", label: "fleet.make_model" },
  { key: "last", label: "hub.col.last_inspection_at" },
  { key: "next", label: "hub.col.next_inspection_at" },
  { key: "status", label: "common.status" },
];

const YEARLY = {
  mobilization: { resource: "fleet.inspection_status", title: "inspections.mobilization.title", description: "hub.kind.mobilization", icon: "clipboard-check", path: "/inspections/mobilization", last: "mobilization_last", next: "mobilization_next" },
  third_party: { resource: "inspections.third_party", title: "inspections.third_party.title", description: "hub.kind.third_party_db", icon: "badge-check", path: "/inspections/third-party", last: "third_party_last", next: "third_party_next" },
} as const;

/** Mobilization or third-party inspections: every vehicle with its last and next date; a vehicle opens a year. */
export async function YearlyInspectionHub({ kind }: { kind: keyof typeof YEARLY }) {
  const cfg = YEARLY[kind];
  const session = await requirePermission(cfg.resource, "view");
  if (session.platformMode) redirect("/platform");
  const supabase = await createClient();
  const [rows, summary, { data: yearRows }] = await Promise.all([loadHubVehicles(), loadInspectionSummary(), supabase.from("v_inspection_years").select("vehicle_id, year, records").eq("kind", kind)]);
  const today = todayISO();
  const in30 = daysFromNowISO(30);
  const [cy, cm] = today.split("-").map(Number) as [number, number];

  const years = new Map<string, Record<number, number>>();
  for (const y of (yearRows ?? []) as { vehicle_id: string; year: number; records: number }[]) {
    const m = years.get(y.vehicle_id) ?? {};
    m[y.year] = Number(y.records);
    years.set(y.vehicle_id, m);
  }

  const nextOf = (id: string) => (summary.get(id)?.[cfg.next] as string | null | undefined) ?? null;
  const inspected = rows.filter((r) => summary.get(r.id)?.[cfg.last]).length;
  const overdue = rows.filter((r) => (nextOf(r.id) ?? "9999") < today).length;
  const due = rows.filter((r) => {
    const n = nextOf(r.id);
    return !!n && n >= today && n <= in30;
  }).length;
  const vehicles: HubVehicle[] = rows.map((r) => {
    const s = summary.get(r.id);
    const last = (s?.[cfg.last] as string | null | undefined) ?? null;
    const next = nextOf(r.id);
    const nextCell = dueCell(next, today, in30);
    const chip: HubVehicle["chip"] = !last ? { label: t("hub.not_yet_inspected"), tone: "neutral" } : typeof nextCell === "object" && nextCell ? nextCell.chip : { label: t("hub.last_inspected", { date: formatDate(last) }), tone: "neutral" };
    return {
      ...base(r),
      chip,
      detail: last ? t("hub.last_inspected", { date: formatDate(last) }) : null,
      cells: { last: last ? formatDate(last) : t("hub.not_yet_inspected"), next: nextCell },
      years: years.get(r.id) ?? {},
    };
  });

  const kinds: HubKind[] = [{ key: kind, label: t(cfg.title), description: t(cfg.description), icon: cfg.icon, path: cfg.path, monthly: false, yearly: true }];

  return (
    <>
      <PageHeader
        title={t(cfg.title)}
        actions={
          <>
            <BackToInspections />
            <ViewAllMenu items={[{ href: `${cfg.path}?vehicle=all${kind === "third_party" ? "&details=1" : ""}`, label: t(cfg.title) }]} />
            <AddMenu items={session.can(cfg.resource, "create") ? [{ href: `${cfg.path}/new`, label: t(cfg.title) }] : []} label={t("inspections.add")} />
          </>
        }
      />
      <HubSummary
        tiles={[
          { label: t("hub.tile.vehicles_inspected"), value: `${formatNumber(inspected)} / ${formatNumber(rows.length)}` },
          { label: t("hub.tile.due_30"), value: formatNumber(due), tone: due ? "warning" : undefined },
          { label: t("hub.tile.overdue"), value: formatNumber(overdue), tone: overdue ? "danger" : undefined },
        ]}
      />
      <VehicleHub vehicles={vehicles} kinds={kinds} currentYear={cy} currentMonth={cm} columns={YEARLY_COLUMNS} />
    </>
  );
}

/** The three kinds of inspection on the Inspections page, with one line of status each. */
export async function inspectionChoices() {
  const session = await requireSession();
  const [rows, summary] = await Promise.all([loadHubVehicles(), loadInspectionSummary()]);
  const today = todayISO();
  const in30 = daysFromNowISO(30);
  const inService = rows.filter((r) => r.status === "in_service");
  const dueLine = (key: "mobilization_next" | "third_party_next") => {
    let due = 0;
    let over = 0;
    for (const r of rows) {
      const d = summary.get(r.id)?.[key];
      if (d && d < today) over++;
      else if (d && d <= in30) due++;
    }
    return over ? { text: t("inspections.card.overdue", { count: over }), tone: "danger" as const } : due ? { text: t("inspections.card.due", { count: due }), tone: "warning" as const } : { text: t("inspections.card.up_to_date"), tone: "success" as const };
  };
  const skipped = inService.filter((r) => skippedDays(summary.get(r.id), today) > 0).length;
  const weeklySkipped = inService.filter((r) => skippedWeeks(summary.get(r.id), today) > 0).length;
  return {
    session,
    choices: [
      session.can("inspections.daily", "view")
        ? {
            key: "daily",
            href: "/inspections/daily",
            icon: "sun",
            title: t("inspections.daily.short_title"),
            description: t("hub.kind.daily_db"),
            line: { text: t("inspections.card.daily", { done: inService.filter((r) => summary.get(r.id)?.daily_last === today).length, total: inService.length }), tone: "neutral" as const },
            alert: skipped ? { text: t("hub.tile.vehicles_skipped", { count: skipped }), tone: "danger" as const } : null,
            create: session.can("inspections.daily", "create") ? "/inspections/daily/new" : null,
          }
        : null,
      session.can("inspections.daily", "view")
        ? {
            key: "weekly",
            href: "/inspections/weekly",
            icon: "calendar-days",
            title: t("inspections.weekly.title"),
            description: t("hub.kind.weekly_db"),
            line: { text: t("inspections.card.weekly", { done: inService.filter((r) => (summary.get(r.id)?.weekly_last ?? "") >= weekStartISO(today)).length, total: inService.length }), tone: "neutral" as const },
            alert: weeklySkipped ? { text: t("hub.tile.vehicles_skipped_week", { count: weeklySkipped }), tone: "danger" as const } : null,
            create: session.can("inspections.daily", "create") ? "/inspections/weekly/new" : null,
          }
        : null,
      session.can("fleet.inspection_status", "view")
        ? { key: "mobilization", href: "/inspections/mobilization", icon: "clipboard-check", title: t("inspections.mobilization.title"), description: t("hub.kind.mobilization"), line: dueLine("mobilization_next"), alert: null, create: session.can("fleet.inspection_status", "create") ? "/inspections/mobilization/new" : null }
        : null,
      session.can("inspections.third_party", "view")
        ? { key: "third_party", href: "/inspections/third-party", icon: "badge-check", title: t("inspections.third_party.title"), description: t("hub.kind.third_party_db"), line: dueLine("third_party_next"), alert: null, create: session.can("inspections.third_party", "create") ? "/inspections/third-party/new" : null }
        : null,
    ].filter((c) => c !== null),
  };
}

const WEEKS_CHECKED = 8;

/** The Monday of the week holding the given day. */
function weekStartISO(today: string): string {
  const ms = toDay(today);
  return fromDay(ms - ((new Date(ms).getUTCDay() + 6) % 7) * dayMs);
}

/** Complete weeks (Monday to Sunday) among the last 8 with no weekly inspection, from when the vehicle was added. */
export function skippedWeeks(s: InspectionSummary | undefined, today: string): number {
  const todayMs = toDay(today);
  const monday = todayMs - ((new Date(todayMs).getUTCDay() + 6) % 7) * dayMs;
  const done = (s?.weekly_dates ?? []).map(toDay);
  const added = s?.added_on ? toDay(s.added_on) : 0;
  let missed = 0;
  for (let w = 1; w <= WEEKS_CHECKED; w++) {
    const from = monday - w * 7 * dayMs;
    const to = from + 6 * dayMs;
    if (to < added) continue;
    if (!done.some((d) => d >= from && d <= to)) missed++;
  }
  return missed;
}

/** Weekly inspections: every vehicle with its last inspection, actions and skipped weeks. */
export async function WeeklyInspectionHub({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> } = {}) {
  const range = rangeFromParams(searchParams);
  const when = range?.label ?? t("hub.all_time");
  const session = await requirePermission("inspections.daily", "view");
  if (session.platformMode) redirect("/platform");
  const supabase = await createClient();
  let countQuery = supabase.from("daily_inspections").select("vehicle_id").eq("frequency", "weekly").is("deleted_at", null).limit(20000);
  if (range) countQuery = countQuery.gte("inspection_date", range.from).lte("inspection_date", range.to);
  const [rows, summary, { data: inspectedRows }] = await Promise.all([loadHubVehicles(), loadInspectionSummary(), countQuery]);
  const inspections = new Map<string, number>();
  for (const r of (inspectedRows ?? []) as { vehicle_id: string }[]) inspections.set(r.vehicle_id, (inspections.get(r.vehicle_id) ?? 0) + 1);
  const today = todayISO();
  const [cy, cm] = today.split("-").map(Number) as [number, number];
  const weekStart = fromDay(toDay(today) - ((new Date(toDay(today)).getUTCDay() + 6) % 7) * dayMs);

  const inService = rows.filter((r) => r.status === "in_service");
  const doneThisWeek = inService.filter((r) => (summary.get(r.id)?.weekly_last ?? "") >= weekStart).length;
  const skippedBy = new Map(rows.map((r) => [r.id, r.status === "in_service" ? skippedWeeks(summary.get(r.id), today) : 0]));
  const openActions = rows.reduce((sum, r) => sum + num(summary.get(r.id)?.weekly_open), 0);
  const skippedVehicles = [...skippedBy.values()].filter((n) => n > 0).length;

  const vehicles: HubVehicle[] = rows.map((r) => {
    const s = summary.get(r.id);
    const last = s?.weekly_last ?? null;
    const open = num(s?.weekly_open);
    const closed = num(s?.weekly_closed);
    const skipped = skippedBy.get(r.id) ?? 0;
    let chip: HubVehicle["chip"];
    if (r.status !== "in_service") chip = { label: t("status.out_of_service"), tone: "neutral" };
    else if (skipped > 0) chip = { label: skipped === 1 ? t("hub.skipped_week_one") : t("hub.skipped_weeks", { count: skipped }), tone: "danger" };
    else if (last && last >= weekStart) chip = { label: t("hub.inspected_this_week"), tone: "success" };
    else chip = { label: t("hub.inspected_every_week"), tone: "success" };
    const actions: HubCell = open + closed === 0 ? t("hub.no_actions") : { chip: { label: t("hub.actions_counts", { open, closed }), tone: open > 0 ? (r.not_safe ? "danger" : "warning") : "success" } };
    const status: HubCell | undefined = r.status !== "in_service" || r.not_safe ? undefined : { chip };
    return {
      ...base(r),
      chip,
      badge: open > 0 ? { count: open, label: open === 1 ? t("hub.open_action") : t("hub.open_actions"), tone: r.not_safe ? "danger" : "warning" } : null,
      detail: last ? t("hub.last_inspected", { date: formatDate(last) }) : t("hub.not_yet_inspected"),
      cells: {
        last: last ? { chip: { label: formatDate(last), tone: last >= weekStart ? "success" : "neutral" } } : t("hub.not_yet_inspected"),
        count: formatNumber(inspections.get(r.id) ?? 0),
        actions,
        ...(status ? { status } : {}),
      },
    };
  });

  const kinds: HubKind[] = [{ key: "weekly", label: t("inspections.weekly.title"), description: t("hub.kind.weekly"), icon: "calendar-days", path: "/inspections/weekly", monthly: true, table: "weekly_inspections" }];

  return (
    <>
      <PageHeader
        title={t("inspections.weekly.title")}
        description={t("inspections.weekly.description")}
        actions={
          <>
            <BackToInspections />
            {session.can("inspections", "view") ? (
              <Button asChild variant="outline" className="h-10">
                <Link href="/inspections/anomalies">
                  <AlertTriangle /> {t("hub.open_actions_title")}
                </Link>
              </Button>
            ) : null}
            <ViewAllMenu items={[{ href: "/inspections/weekly?vehicle=all&details=1", label: t("inspections.weekly.title") }]} />
            <AddMenu items={session.can("inspections.daily", "create") ? [{ href: "/inspections/weekly/new", label: t("inspections.weekly.title") }] : []} label={t("inspections.add")} />
          </>
        }
      />
      <SummaryDates label={when} />
      <HubSummary
        tiles={[
          { label: t("hub.tile.inspections"), value: formatNumber([...inspections.values()].reduce((a, b) => a + b, 0)), sub: when },
          { label: t("hub.tile.inspected_this_week"), value: `${formatNumber(doneThisWeek)} / ${formatNumber(inService.length)}`, sub: t("hub.tile.in_service_vehicles") },
          { label: t("hub.tile.skipped_weeks"), value: formatNumber(skippedVehicles), sub: skippedVehicles ? t("hub.tile.vehicles_skipped_week", { count: skippedVehicles }) : t("hub.tile.none_skipped_week"), tone: skippedVehicles ? "danger" : undefined },
          { label: t("hub.open_actions_title"), value: formatNumber(openActions), sub: t("hub.tile.weekly_inspections"), tone: openActions ? "warning" : undefined, href: "/inspections/anomalies" },
        ]}
      />
      <VehicleHub vehicles={vehicles} kinds={kinds} currentYear={cy} currentMonth={cm} columns={DAILY_COLUMNS} listNote={t("hub.list_note.skipped_weeks")} />
    </>
  );
}
