import Link from "next/link";
import { ClipboardCheck, Fuel, Route, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

/** Driver role: no charts. A Today screen with vehicle, tasks and personal reminders. */
export async function DriverToday() {
  const session = await requireSession();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const driverId = session.profile.driver_id;

  const [{ data: assignment }, { data: inspection }, { data: kmLog }, { data: reminders }, { data: requests }] = await Promise.all([
    driverId
      ? supabase.from("vehicle_assignments").select("vehicle:vehicles(id, registration, make, model, odometer_km), request:vehicle_requests(date_needed, date_to, destination)").eq("driver_id", driverId).order("assigned_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null },
    driverId ? supabase.from("daily_inspections").select("id, remark, vehicle_id").eq("driver_id", driverId).eq("inspection_date", today).is("deleted_at", null).limit(1).maybeSingle() : { data: null },
    driverId ? supabase.from("km_logs").select("id, total_km, trip_count, vehicle_id").eq("driver_id", driverId).eq("log_date", today).is("deleted_at", null).limit(1).maybeSingle() : { data: null },
    supabase.from("reminders").select("title, due_date, reminder_type").is("deleted_at", null).neq("status", "done").not("driver_id", "is", null).order("due_date").limit(6),
    driverId ? supabase.from("fuel_requests").select("id, request_date, status, approved_l").eq("driver_id", driverId).is("deleted_at", null).order("request_date", { ascending: false }).limit(3) : { data: [] },
  ]);

  const a = assignment as { vehicle: { id: string; registration: string; make: string; model: string; odometer_km: number } | null; request: { date_needed: string; date_to: string | null; destination: string } | null } | null;
  const vehicle = a?.vehicle ?? null;
  const insp = inspection as { id: string; remark: string; vehicle_id: string } | null;
  const log = kmLog as { id: string; total_km: number; trip_count: number } | null;

  const tasks = [
    { done: !!insp, label: t("inspections.daily.title"), href: insp ? `/inspections/daily/${insp.id}` : "/inspections/daily/new", icon: ClipboardCheck },
    { done: !!log, label: t("daily_use.km_log.title"), href: log ? `/daily-use/km-log/${log.id}` : "/daily-use/km-log/new", icon: Route, sub: log ? `${log.trip_count} ${t("nav.trips").toLowerCase()} · ${formatNumber(log.total_km)} km` : undefined },
    { done: false, label: t("daily_use.fuel.new"), href: "/daily-use/fuel-log/new", icon: Fuel },
    { done: false, label: t("expenses.maintenance.new"), href: "/expenses/maintenance/requests/new", icon: Wrench },
  ];

  return (
    <>
      <PageHeader title={t("dashboard.today")} description={t("dashboard.today_description")} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.my_vehicle")}</CardTitle>
          {vehicle ? <CardDescription>{a?.request ? `${a.request.destination} · ${formatDate(a.request.date_needed)}` : ""}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          {vehicle ? (
            <Link href={`/fleet/${vehicle.id}`} className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/40">
              <span>
                <span className="block text-lg font-semibold">{vehicle.registration}</span>
                <span className="block text-sm text-muted-foreground">
                  {vehicle.make} {vehicle.model}
                </span>
              </span>
              <span className="text-right text-sm tabular-nums">{formatNumber(vehicle.odometer_km)} km</span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{t("dashboard.no_vehicle")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.tasks")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <Button key={task.label} asChild variant="outline" size="lg" className="h-auto justify-start py-4">
                <Link href={task.href}>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="ml-2 flex-1 text-left">
                    <span className="block font-medium">{task.label}</span>
                    <span className="block text-xs text-muted-foreground">{task.sub ?? (task.done ? t("status.done") : t("status.not_started"))}</span>
                  </span>
                  <StatusChip status={task.done ? "done" : "not_started"} />
                </Link>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.my_reminders")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {((reminders ?? []) as { title: string; due_date: string | null }[]).map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                <span className="truncate">{r.title}</span>
                <ReminderChip date={r.due_date} />
              </div>
            ))}
            {(reminders ?? []).length === 0 ? <p className="text-muted-foreground">{t("dashboard.lists.nothing_pending")}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("daily_use.fuel.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {((requests ?? []) as { id: string; request_date: string; status: string; approved_l: number | null }[]).map((r) => (
              <Link key={r.id} href={`/daily-use/fuel-log/${r.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-muted/40">
                <span>
                  {formatDate(r.request_date)}
                  {r.approved_l ? <span className="ml-2 text-muted-foreground">{formatNumber(r.approved_l, 1)} L</span> : null}
                </span>
                <StatusChip status={r.status} />
              </Link>
            ))}
            {(requests ?? []).length === 0 ? <p className="text-muted-foreground">{t("common.empty_title")}</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
