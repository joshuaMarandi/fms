import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardFilters, rangeFor, type RangeKey } from "./filters";
import { DonutChart, MonthlyBarChart, MonthlyLineChart, SimpleAreaChart, Sparkline, TargetBarChart, Widget } from "./charts";
import { DriverToday } from "./driver-today";
import { cn, daysFromNowISO, formatDate, formatNumber, formatTzs, nowMs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

type Row = Record<string, unknown>;

const REQUESTS = [
  { table: "fuel_requests", resource: "daily_use.fuel_log", path: "/daily-use/fuel-log", label: "daily_use.fuel.title", select: "id, request_date, created_at, vehicle:vehicles(registration)" },
  { table: "vehicle_requests", resource: "daily_use.trip_requests", path: "/daily-use/trip-requests", label: "daily_use.trips.title", select: "id, requester_name, destination, created_at" },
  { table: "maintenance_requests", resource: "expenses.maintenance.requests", path: "/expenses/maintenance/requests", label: "expenses.maintenance.requests.title", select: "id, request_date, created_at, vehicle:vehicles(registration)" },
  { table: "tyre_requests", resource: "expenses.tyres", path: "/expenses/tyres", label: "expenses.tyres.title", select: "id, request_date, created_at, vehicle:vehicles(registration)" },
  { table: "wash_requests", resource: "expenses.washing", path: "/expenses/washing", label: "expenses.washing.title", select: "id, request_date, created_at, vehicle:vehicles(registration)" },
  { table: "leave_requests", resource: "expenses.leave.requests", path: "/expenses/leave/requests", label: "expenses.leave.requests.title", select: "id, date_from, created_at, employee:profiles(full_name)" },
  { table: "timesheets", resource: "expenses.timesheet", path: "/expenses/timesheet", label: "expenses.timesheet.title", select: "id, period_month, employee_name, created_at" },
];

function monthKey(d: string | Date) {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}
function months(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(from.slice(0, 7) + "-01T00:00:00");
  const end = new Date(to.slice(0, 7) + "-01T00:00:00");
  while (d <= end) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const session = await requirePermission("dashboard", "view");
  const supabase = await createClient();

  if (session.isDriverOnly) {
    return <DriverToday />;
  }

  const range = (typeof sp.range === "string" ? sp.range : "30d") as RangeKey;
  const { from, to } = rangeFor(range, typeof sp.from === "string" ? sp.from : null, typeof sp.to === "string" ? sp.to : null);
  const vehicleId = typeof sp.vehicle === "string" ? sp.vehicle : null;
  const can = session.can;
  const mk = months(from, to);
  const vf = <T extends { vehicle_id?: unknown }>(rows: T[]) => (vehicleId ? rows.filter((r) => r.vehicle_id === vehicleId) : rows);

  const approvable = REQUESTS.filter((r) => can(r.resource, "approve"));

  const [
    kpis,
    { data: vehicles },
    { data: fuelIssues },
    { data: fuelExp },
    { data: costRows },
    { data: kmLogs },
    { data: vreq },
    { data: workOrders },
    { data: reminders },
    { data: trainings },
    { data: drivers },
    { data: leave },
    { data: timesheets },
    { data: incidentTotals },
    { data: anomalies },
    pending,
    { data: activity },
    { data: remarks },
    health,
  ] = await Promise.all([
    supabase.rpc("dashboard_kpis", { p_from: from, p_to: to, p_vehicle: vehicleId }),
    supabase.from("vehicles").select("id, registration, target_km_per_l").is("deleted_at", null).order("registration"),
    can("daily_use.fuel_log", "view") ? supabase.from("fuel_issues").select("vehicle_id, issue_date, total_cost_tzs, fuel_issued_l").is("deleted_at", null).gte("issue_date", mk[0] + "-01").lte("issue_date", to) : { data: [] },
    can("expenses.fuel", "view") ? supabase.from("fuel_expenses").select("vehicle_id, attained_km_per_l, target_km_per_l, expense_date").is("deleted_at", null).gte("expense_date", from).lte("expense_date", to) : { data: [] },
    can("expenses", "view") ? supabase.rpc("generate_report", { p_type: "fleet_cost", p_filters: { from: mk[0] + "-01", to, vehicle_id: vehicleId } }) : { data: [] },
    can("daily_use.km_log", "view") ? supabase.from("km_logs").select("vehicle_id, log_date, total_km, trip_count").is("deleted_at", null).gte("log_date", from).lte("log_date", to) : { data: [] },
    can("daily_use.trip_requests", "view") ? supabase.from("vehicle_requests").select("status, requested_at").is("deleted_at", null).gte("requested_at", from).lte("requested_at", to + "T23:59:59") : { data: [] },
    can("expenses.maintenance.work_orders", "view") ? supabase.from("work_orders").select("vehicle_id, total_days, date_out").is("deleted_at", null).gte("date_out", from).lte("date_out", to) : { data: [] },
    supabase.from("reminders").select("reminder_type, due_date, due_km, title, vehicle_id, driver_id, resource_key").is("deleted_at", null).neq("status", "done").order("due_date", { ascending: true, nullsFirst: false }),
    can("expenses.trainings.mandatory", "view") ? supabase.from("mandatory_trainings").select("driver_id, courses").is("deleted_at", null) : { data: [] },
    can("drivers.personal", "view") ? supabase.from("drivers").select("id").is("deleted_at", null).eq("is_active", true) : { data: [] },
    can("expenses.leave", "view") ? supabase.from("leave_requests").select("date_from, total_days, status").is("deleted_at", null).in("status", ["approved", "completed"]).gte("date_from", mk[0] + "-01").lte("date_from", to) : { data: [] },
    can("expenses.timesheet", "view") ? supabase.from("timesheets").select("period_month, total_normal_hours, total_overtime_hours").is("deleted_at", null).gte("period_month", mk[0] + "-01").lte("period_month", to) : { data: [] },
    can("expenses.safety", "view") ? supabase.from("v_incident_totals").select("*").gte("month", mk[0] + "-01").lte("month", to) : { data: [] },
    can("inspections", "view") ? supabase.from("inspection_anomalies").select("id, vehicle_id, description, when_to_act, date_opened, vehicle:vehicles(registration)").is("deleted_at", null).eq("status", "open").order("date_opened") : { data: [] },
    Promise.all(approvable.map(async (r) => ({ ...r, rows: ((await supabase.from(r.table).select(r.select).eq("status", "submitted").is("deleted_at", null).order("created_at").limit(10)).data ?? []) as unknown as Row[] }))),
    can("settings.audit", "view") ? supabase.from("audit_log").select("id, created_at, action, table_name, actor_id").order("created_at", { ascending: false }).limit(8) : supabase.from("notifications").select("id, created_at, title, kind").order("created_at", { ascending: false }).limit(8),
    can("fleet.remarks", "view") ? supabase.from("vehicle_remarks").select("id, body, created_at, vehicle:vehicles(registration)").is("deleted_at", null).order("created_at", { ascending: false }).limit(5) : { data: [] },
    session.permissions.isOwner || session.permissions.isAdmin
      ? Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
          supabase.from("attachments").select("size_bytes").is("deleted_at", null),
          supabase.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "grant_change").gte("created_at", daysFromNowISO(-30)),
        ])
      : Promise.resolve(null),
  ]);

  const k = (kpis.data ?? {}) as Record<string, number>;
  const vehicleName = new Map(((vehicles ?? []) as Row[]).map((v) => [v.id as string, v.registration as string]));
  const vehicleTarget = new Map(((vehicles ?? []) as Row[]).map((v) => [v.id as string, v.target_km_per_l as number | null]));

  // Fuel trend by month (plus per vehicle when one is selected)
  const fuelRows = vf((fuelIssues ?? []) as { vehicle_id: string; issue_date: string; total_cost_tzs: number }[]);
  const fuelTrend = mk.map((m) => ({ label: monthLabel(m), cost: fuelRows.filter((r) => monthKey(r.issue_date) === m).reduce((s, r) => s + Number(r.total_cost_tzs ?? 0), 0) }));
  const sparkFuel = fuelTrend.map((p) => ({ v: p.cost }));

  // Consumption per vehicle
  const consRows = vf((fuelExp ?? []) as { vehicle_id: string; attained_km_per_l: number | null; target_km_per_l: number | null }[]);
  const consumption = Array.from(new Set(consRows.map((r) => r.vehicle_id))).map((vid) => {
    const rows = consRows.filter((r) => r.vehicle_id === vid && r.attained_km_per_l !== null);
    const attained = rows.length ? rows.reduce((s, r) => s + Number(r.attained_km_per_l), 0) / rows.length : 0;
    return { label: vehicleName.get(vid) ?? vid.slice(0, 6), attained: Number(attained.toFixed(2)), target: vehicleTarget.get(vid) ?? rows[0]?.target_km_per_l ?? null };
  });

  // Cost by category
  const cost = (costRows ?? []) as { month: string; vehicle: string; category: string; amount_tzs: number }[];
  const categories = ["fuel", "maintenance", "tyres", "washing"];
  const costByMonth = mk.map((m) => ({ label: monthLabel(m), ...Object.fromEntries(categories.map((c) => [c, cost.filter((r) => monthKey(r.month) === m && r.category === c).reduce((s, r) => s + Number(r.amount_tzs ?? 0), 0)])) }));
  const costShare = categories.map((c) => ({ key: c, label: t(`dashboard.series.${c}`), value: cost.filter((r) => r.category === c).reduce((s, r) => s + Number(r.amount_tzs ?? 0), 0) })).filter((c) => c.value > 0);

  // Km per vehicle and trips per day
  const km = vf((kmLogs ?? []) as { vehicle_id: string; log_date: string; total_km: number; trip_count: number }[]);
  const kmPerVehicle = Array.from(new Set(km.map((r) => r.vehicle_id))).map((vid) => ({ label: vehicleName.get(vid) ?? vid.slice(0, 6), km: km.filter((r) => r.vehicle_id === vid).reduce((s, r) => s + Number(r.total_km ?? 0), 0) }));
  const tripsByDay = Array.from(new Set(km.map((r) => r.log_date))).sort().map((d) => ({ label: formatDate(d).slice(0, 6), trips: km.filter((r) => r.log_date === d).reduce((s, r) => s + Number(r.trip_count ?? 0), 0) }));

  // Requests by status
  const vr = (vreq ?? []) as { status: string }[];
  const requestsByStatus = ["submitted", "approved", "rejected"].map((s) => ({ key: s, label: t(`status.${s}`), value: vr.filter((r) => r.status === s).length })).filter((x) => x.value > 0);

  // Days out of service
  const wo = vf((workOrders ?? []) as { vehicle_id: string; total_days: number | null }[]);
  const daysOut = Array.from(new Set(wo.map((r) => r.vehicle_id))).map((vid) => ({ label: vehicleName.get(vid) ?? vid.slice(0, 6), days: wo.filter((r) => r.vehicle_id === vid).reduce((s, r) => s + Number(r.total_days ?? 0), 0) }));

  // Compliance
  const rem = (reminders ?? []) as { reminder_type: string; due_date: string | null; title: string; vehicle_id: string | null; driver_id: string | null }[];
  const today = todayISO();
  const in30 = daysFromNowISO(30);
  const complianceTypes = [
    { key: "insurance", types: ["insurance_end"], label: t("fleet.tab.insurance") },
    { key: "inspection", types: ["inspection_renewal", "third_party_renewal"], label: t("fleet.tab.inspection") },
    { key: "licence", types: ["licence_expiry"], label: t("drivers.tab.licence") },
    { key: "osha", types: ["osha_redo"], label: t("drivers.tab.osha") },
    { key: "training", types: ["training_refresher"], label: t("expenses.trainings.title") },
  ];
  const compliance = complianceTypes.map((c) => {
    const rows = rem.filter((r) => c.types.includes(r.reminder_type) && r.due_date);
    return {
      label: c.label,
      valid: rows.filter((r) => r.due_date! > in30).length,
      due_soon: rows.filter((r) => r.due_date! >= today && r.due_date! <= in30).length,
      overdue: rows.filter((r) => r.due_date! < today).length,
    };
  });

  // Training completion
  const tr = (trainings ?? []) as { driver_id: string; courses: string[] }[];
  const courseKeys = ["defensive_driving", "four_wd", "fatigue", "night_driving"];
  const training = courseKeys.map((c) => ({ label: t(`expenses.trainings.course.${c}`), count: new Set(tr.filter((r) => (r.courses ?? []).includes(c)).map((r) => r.driver_id)).size }));
  const driverCount = (drivers ?? []).length;

  // Leave and timesheets
  const lv = (leave ?? []) as { date_from: string; total_days: number }[];
  const leaveByMonth = mk.map((m) => ({ label: monthLabel(m), days: lv.filter((r) => monthKey(r.date_from) === m).reduce((s, r) => s + Number(r.total_days ?? 0), 0) }));
  const ts = (timesheets ?? []) as { period_month: string; total_normal_hours: number; total_overtime_hours: number }[];
  const hoursByMonth = mk.map((m) => ({ label: monthLabel(m), normal: ts.filter((r) => monthKey(r.period_month) === m).reduce((s, r) => s + Number(r.total_normal_hours ?? 0), 0), overtime: ts.filter((r) => monthKey(r.period_month) === m).reduce((s, r) => s + Number(r.total_overtime_hours ?? 0), 0) }));

  // Incidents
  const inc = (incidentTotals ?? []) as { month: string; incidents: number; injuries: number; fatalities: number }[];
  const incidentsByMonth = mk.map((m) => {
    const r = inc.find((x) => monthKey(x.month) === m);
    return { label: monthLabel(m), incidents: Number(r?.incidents ?? 0), injuries: Number(r?.injuries ?? 0), fatalities: Number(r?.fatalities ?? 0) };
  });

  // Anomaly ageing
  const an = vf((anomalies ?? []) as unknown as { id: string; vehicle_id: string; description: string; when_to_act: string; date_opened: string; vehicle: { registration: string } | null }[]);
  const nowTs = nowMs();
  const age = (d: string) => Math.floor((nowTs - new Date(d).getTime()) / 86400000);
  const ageing = [
    { label: t("dashboard.bucket.0_7"), count: an.filter((a) => age(a.date_opened) <= 7).length },
    { label: t("dashboard.bucket.8_30"), count: an.filter((a) => age(a.date_opened) > 7 && age(a.date_opened) <= 30).length },
    { label: t("dashboard.bucket.31_90"), count: an.filter((a) => age(a.date_opened) > 30 && age(a.date_opened) <= 90).length },
    { label: t("dashboard.bucket.90_plus"), count: an.filter((a) => age(a.date_opened) > 90).length },
  ];

  const expiring = rem.filter((r) => r.due_date && r.due_date <= in30).slice(0, 8);
  const isHod = session.roles.some((r) => r.name === "Head of department") && !session.permissions.isAdmin && !session.permissions.isOwner;
  const isCoordinator = session.roles.some((r) => r.name === "Fleet coordinator") && !session.permissions.isAdmin && !session.permissions.isOwner;

  const change = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / prev) * 100);

  const kpiCards = [
    { show: can("fleet.details", "view"), title: t("dashboard.kpi.vehicles"), value: `${formatNumber(k.vehicles_in_service ?? 0)} / ${formatNumber(k.vehicles_total ?? 0)}`, sub: t("dashboard.kpi.vehicles_desc", { garage: k.vehicles_in_garage ?? 0 }), spark: [], href: "/fleet" },
    { show: approvable.length > 0, title: t("dashboard.kpi.pending"), value: formatNumber(k.pending_approvals ?? 0), sub: approvable.map((a) => t(a.label)).slice(0, 2).join(", "), spark: [], href: approvable[0]?.path },
    { show: true, title: t("dashboard.kpi.expiring"), value: formatNumber(k.expiring_30 ?? 0), sub: `${t("dashboard.kpi.overdue", { count: k.overdue ?? 0 })} · ${t("dashboard.kpi.expiring_desc")}`, spark: [], tone: (k.overdue ?? 0) > 0 ? "danger" : undefined },
    { show: can("inspections", "view"), title: t("dashboard.kpi.anomalies"), value: formatNumber(k.open_anomalies ?? 0), sub: an.filter((a) => a.when_to_act === "immediately").length ? `${an.filter((a) => a.when_to_act === "immediately").length} ${t("inspections.anomaly.when.immediately").toLowerCase()}` : "", spark: [], href: "/inspections/anomalies", tone: an.some((a) => a.when_to_act === "immediately") ? "danger" : undefined },
    { show: can("expenses.fuel", "view") || can("daily_use.fuel_log", "view"), title: t("dashboard.kpi.fuel_cost"), value: formatTzs(k.fuel_cost ?? 0), change: change(k.fuel_cost ?? 0, k.fuel_cost_prev ?? 0), spark: sparkFuel, href: "/expenses/fuel", invert: true },
    { show: can("expenses.safety", "view"), title: t("dashboard.kpi.incidents"), value: formatNumber(k.incidents ?? 0), change: change(k.incidents ?? 0, k.incidents_prev ?? 0), spark: incidentsByMonth.map((p) => ({ v: p.incidents })), href: "/expenses/safety/incidents", invert: true },
  ].filter((c) => c.show);

  const tasks = (
    <div className="grid gap-6 lg:grid-cols-3">
      {approvable.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.lists.needs_approval")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {pending.every((p) => p.rows.length === 0) ? <p className="text-muted-foreground">{t("dashboard.lists.nothing_pending")}</p> : null}
            {pending.flatMap((p) =>
              p.rows.map((r) => (
                <div key={`${p.table}-${r.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t(p.label)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {(r.vehicle as { registration?: string } | null)?.registration ?? (r.employee as { full_name?: string } | null)?.full_name ?? (r.employee_name as string) ?? (r.requester_name as string) ?? ""} · {formatDate((r.request_date as string) ?? (r.date_from as string) ?? (r.period_month as string) ?? (r.created_at as string))}
                    </span>
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`${p.path}/${r.id}`}>{t("approval.review")}</Link>
                  </Button>
                </div>
              )),
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.lists.expiring")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {expiring.length === 0 ? <p className="text-muted-foreground">{t("dashboard.lists.nothing_pending")}</p> : null}
          {expiring.map((r, i) => (
            <Link key={i} href={r.vehicle_id ? `/fleet/${r.vehicle_id}` : r.driver_id ? `/drivers/${r.driver_id}` : "#"} className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-muted/40">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.title}</span>
                <span className="block text-xs text-muted-foreground">{formatDate(r.due_date)}</span>
              </span>
              <ReminderChip date={r.due_date} />
            </Link>
          ))}
        </CardContent>
      </Card>
      {can("inspections", "view") ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.lists.anomalies")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {an.length === 0 ? <p className="text-muted-foreground">{t("dashboard.lists.nothing_pending")}</p> : null}
            {an.slice(0, 8).map((a) => (
              <Link key={a.id} href="/inspections/anomalies" className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.vehicle?.registration}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                </span>
                <StatusChip status={a.when_to_act} tone={a.when_to_act === "immediately" ? "danger" : a.when_to_act === "before_next_service" ? "warning" : "neutral"} label={t(`inspections.anomaly.when.${a.when_to_act}`)} />
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  const charts = (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {can("daily_use.fuel_log", "view") && !isHod ? (
        <Widget title={t("dashboard.chart.fuel_trend")} description={t("dashboard.chart.fuel_trend_desc")} empty={fuelTrend.every((p) => p.cost === 0)}>
          <MonthlyLineChart data={fuelTrend} series={[{ key: "cost", label: t("dashboard.series.cost") }]} unit="tzs" />
        </Widget>
      ) : null}
      {can("expenses.fuel", "view") ? (
        <Widget title={t("dashboard.chart.consumption")} description={t("dashboard.chart.consumption_desc")} empty={consumption.length === 0}>
          <TargetBarChart data={consumption} />
        </Widget>
      ) : null}
      {can("expenses", "view") && !isCoordinator ? (
        <Widget title={t("dashboard.chart.cost_by_category")} description={t("dashboard.chart.cost_by_category_desc")} empty={cost.length === 0}>
          <MonthlyBarChart data={costByMonth} series={categories.map((c) => ({ key: c, label: t(`dashboard.series.${c}`) }))} stacked unit="tzs" />
        </Widget>
      ) : null}
      {can("expenses", "view") && !isCoordinator ? (
        <Widget title={t("dashboard.chart.cost_share")} description={t("dashboard.chart.cost_share_desc")} empty={costShare.length === 0}>
          <DonutChart data={costShare} unit="tzs" />
        </Widget>
      ) : null}
      {can("daily_use.km_log", "view") && !isHod ? (
        <Widget title={t("dashboard.chart.km_per_vehicle")} description={t("dashboard.chart.km_per_vehicle_desc")} empty={kmPerVehicle.length === 0}>
          <MonthlyBarChart data={kmPerVehicle} series={[{ key: "km", label: t("dashboard.series.km") }]} />
        </Widget>
      ) : null}
      {can("daily_use.km_log", "view") && (isCoordinator || session.permissions.isOwner || session.permissions.isAdmin) ? (
        <Widget title={t("dashboard.chart.trips_per_day")} description={t("dashboard.chart.trips_per_day_desc")} empty={tripsByDay.length === 0}>
          <SimpleAreaChart data={tripsByDay} dataKey="trips" label={t("dashboard.series.trips")} />
        </Widget>
      ) : null}
      {can("daily_use.trip_requests", "view") && !isHod ? (
        <Widget title={t("dashboard.chart.requests_by_status")} description={t("dashboard.chart.requests_by_status_desc")} empty={requestsByStatus.length === 0}>
          <DonutChart data={requestsByStatus} />
        </Widget>
      ) : null}
      {can("expenses.maintenance.work_orders", "view") && !isCoordinator ? (
        <Widget title={t("dashboard.chart.days_out")} description={t("dashboard.chart.days_out_desc")} empty={daysOut.length === 0}>
          <MonthlyBarChart data={daysOut} series={[{ key: "days", label: t("dashboard.series.days") }]} />
        </Widget>
      ) : null}
      {(can("fleet", "view") || can("drivers", "view")) ? (
        <Widget title={t("dashboard.chart.compliance")} description={t("dashboard.chart.compliance_desc")} empty={compliance.every((c) => c.valid + c.due_soon + c.overdue === 0)}>
          <ComplianceChart data={compliance} />
        </Widget>
      ) : null}
      {can("expenses.trainings.mandatory", "view") ? (
        <Widget title={t("dashboard.chart.training")} description={`${t("dashboard.chart.training_desc")} (${driverCount} ${t("nav.drivers").toLowerCase()})`} empty={training.every((x) => x.count === 0)}>
          <MonthlyBarChart data={training} series={[{ key: "count", label: t("dashboard.series.count") }]} horizontal />
        </Widget>
      ) : null}
      {can("expenses.leave", "view") ? (
        <Widget title={t("dashboard.chart.leave")} description={t("dashboard.chart.leave_desc")} empty={leaveByMonth.every((x) => x.days === 0)}>
          <MonthlyBarChart data={leaveByMonth} series={[{ key: "days", label: t("dashboard.series.days") }]} />
        </Widget>
      ) : null}
      {can("expenses.timesheet", "view") ? (
        <Widget title={t("dashboard.chart.timesheet")} description={t("dashboard.chart.timesheet_desc")} empty={hoursByMonth.every((x) => x.normal + x.overtime === 0)}>
          <MonthlyBarChart data={hoursByMonth} series={[{ key: "normal", label: t("dashboard.series.normal") }, { key: "overtime", label: t("dashboard.series.overtime") }]} />
        </Widget>
      ) : null}
      {can("expenses.safety", "view") ? (
        <Widget title={t("dashboard.chart.incidents")} description={t("dashboard.chart.incidents_desc")} empty={incidentsByMonth.every((x) => x.incidents === 0)}>
          <MonthlyLineChart data={incidentsByMonth} series={[{ key: "incidents", label: t("dashboard.series.incidents") }, { key: "injuries", label: t("dashboard.series.injuries") }, { key: "fatalities", label: t("dashboard.series.fatalities") }]} />
        </Widget>
      ) : null}
      {can("inspections", "view") && !isHod ? (
        <Widget title={t("dashboard.chart.anomaly_ageing")} description={t("dashboard.chart.anomaly_ageing_desc")} empty={an.length === 0}>
          <MonthlyBarChart data={ageing} series={[{ key: "count", label: t("dashboard.series.count") }]} />
        </Widget>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} actions={<DashboardFilters vehicles={((vehicles ?? []) as Row[]).map((v) => ({ id: v.id as string, registration: v.registration as string }))} />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpiCards.map((c) => (
          <Card key={c.title} className={cn(c.tone === "danger" && "border-danger/40")}>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">{c.title}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{c.href ? <Link href={c.href} className="hover:underline">{c.value}</Link> : c.value}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {"change" in c && c.change !== null && c.change !== undefined ? (
                <p className={cn("flex items-center gap-1 text-xs", (c.invert ? c.change <= 0 : c.change >= 0) ? "text-success" : "text-danger")}>
                  {c.change > 0 ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : c.change < 0 ? <ArrowDownRight className="size-3.5" aria-hidden="true" /> : <Minus className="size-3.5" aria-hidden="true" />}
                  {Math.abs(c.change).toFixed(0)}% {t("common.change_vs_previous")}
                </p>
              ) : c.sub ? (
                <p className="text-xs text-muted-foreground">{c.sub}</p>
              ) : null}
              {c.spark.length > 1 ? <Sparkline data={c.spark} color={c.tone === "danger" ? "var(--chart-4)" : "var(--chart-1)"} /> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {health ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardHeader className="pb-1"><CardDescription className="text-xs">{t("dashboard.system_health.users")}</CardDescription><CardTitle className="text-xl">{formatNumber(health[0].count ?? 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-1"><CardDescription className="text-xs">{t("dashboard.system_health.storage")}</CardDescription><CardTitle className="text-xl">{formatNumber(((health[1].data ?? []) as { size_bytes: number | null }[]).reduce((s, a) => s + Number(a.size_bytes ?? 0), 0) / (1024 * 1024), 1)} MB</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-1"><CardDescription className="text-xs">{t("dashboard.system_health.role_changes")}</CardDescription><CardTitle className="text-xl">{formatNumber(health[2].count ?? 0)}</CardTitle></CardHeader></Card>
        </div>
      ) : null}

      {isCoordinator ? (
        <>
          {tasks}
          {charts}
        </>
      ) : (
        <>
          {charts}
          {tasks}
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.lists.activity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {((activity ?? []) as Row[]).map((a) => (
                <li key={a.id as string} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate">{(a.title as string) ?? `${String(a.action).replace(/_/g, " ")} · ${a.table_name}`}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.created_at as string, true)}</span>
                </li>
              ))}
              {(activity ?? []).length === 0 ? <li className="py-2 text-muted-foreground">{t("dashboard.no_data")}</li> : null}
            </ul>
          </CardContent>
        </Card>
        {isHod || can("fleet.remarks", "view") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.remarks")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {((remarks ?? []) as Row[]).map((r) => (
                  <li key={r.id as string} className="py-2">
                    <p className="truncate">{r.body as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {(r.vehicle as { registration?: string } | null)?.registration} · {formatDate(r.created_at as string)}
                    </p>
                  </li>
                ))}
                {(remarks ?? []).length === 0 ? <li className="py-2 text-muted-foreground">{t("fleet.no_remarks")}</li> : null}
              </ul>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/fleet">{t("fleet.title")}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function ComplianceChart({ data }: { data: { label: string; valid: number; due_soon: number; overdue: number }[] }) {
  return <ComplianceBars data={data} />;
}

import { ComplianceBars } from "./compliance-bars";
