import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SchemaForm } from "@/components/patterns/schema-form";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { KmReminderChip, ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { RecordTitle } from "@/components/modules/record-title";
import { RemarksThread } from "./remarks-thread";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadOptions } from "@/lib/data/records";
import { VEHICLE_DOCUMENTS } from "@/modules/fleet";
import { formatDate, formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

export default async function VehiclePage({ params, searchParams }: PageProps<"/fleet/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "details";
  const session = await requirePermission("fleet.details", "view");
  const supabase = await createClient();

  const [{ data: vehicle }, { data: safety }, { data: inspections }, { data: insurance }, { data: schedule }, { data: remarks }, options] = await Promise.all([
    supabase.from("vehicles").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("v_vehicle_safety").select("*").eq("vehicle_id", id).maybeSingle(),
    supabase.from("vehicle_inspections").select("*").eq("vehicle_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("vehicle_insurance").select("*").eq("vehicle_id", id).is("deleted_at", null).order("end_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("service_schedules").select("*").eq("vehicle_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("vehicle_remarks").select("*, author:profiles!vehicle_remarks_created_by_fkey(full_name)").eq("vehicle_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    loadOptions(["sites"]),
  ]);
  if (!vehicle) notFound();

  const v = vehicle as Record<string, unknown>;
  const internal = ((inspections ?? []) as Record<string, unknown>[]).find((i) => i.kind === "internal") ?? null;
  const third = ((inspections ?? []) as Record<string, unknown>[]).find((i) => i.kind === "third_party") ?? null;
  const safe = safety as { not_safe_for_use: boolean; open_anomalies: number } | null;
  const title = `${v.registration}`;
  const extra = { vehicle_id: id };
  const paths = [`/fleet/${id}`, "/fleet"];

  const [{ data: recentTrips }, { data: recentFuel }, { data: recentWork }] = await Promise.all([
    supabase.from("km_logs").select("id, log_date, total_km, trip_count").eq("vehicle_id", id).is("deleted_at", null).order("log_date", { ascending: false }).limit(8),
    supabase.from("fuel_issues").select("id, issue_date, fuel_issued_l, total_cost_tzs, consumption_km_per_l").eq("vehicle_id", id).is("deleted_at", null).order("issue_date", { ascending: false }).limit(8),
    supabase.from("work_orders").select("id, date_out, date_in, garage_name, total_days, status").eq("vehicle_id", id).is("deleted_at", null).order("date_out", { ascending: false }).limit(8),
  ]);

  return (
    <>
      <RecordTitle title={title} />
      <PageHeader
        title={`${v.registration}`}
        description={`${v.make} ${v.model}${v.yom ? `, ${v.yom}` : ""} · ${formatNumber(v.odometer_km as number)} km`}
        actions={
          <>
            <StatusChip status={v.status as string} />
            {safe?.not_safe_for_use ? <StatusChip status="not_safe" /> : null}
            {safe && safe.open_anomalies > 0 ? (
              <Link href={`/inspections/anomalies?vehicle=${id}`} className="status-chip status-chip-danger hover:underline">
                {t("fleet.open_anomalies", { count: safe.open_anomalies })}
              </Link>
            ) : null}
          </>
        }
      />
      {safe?.not_safe_for_use ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-bg p-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>{t("fleet.not_safe_banner")}</p>
        </div>
      ) : null}

      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start overflow-x-auto">
          <TabsTrigger value="details">{t("fleet.tab.details")}</TabsTrigger>
          {session.can("fleet.inspection_status", "view") ? <TabsTrigger value="inspection">{t("fleet.tab.inspection")}</TabsTrigger> : null}
          {session.can("fleet.insurance", "view") ? <TabsTrigger value="insurance">{t("fleet.tab.insurance")}</TabsTrigger> : null}
          {session.can("fleet.maintenance_schedule", "view") ? <TabsTrigger value="maintenance">{t("fleet.tab.maintenance")}</TabsTrigger> : null}
          {session.can("fleet.documents", "view") ? <TabsTrigger value="documents">{t("fleet.tab.documents")}</TabsTrigger> : null}
          {session.can("fleet.remarks", "view") ? <TabsTrigger value="remarks">{t("fleet.tab.remarks")}</TabsTrigger> : null}
          <TabsTrigger value="history">{t("fleet.tab.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <SchemaForm schemaKey="fleet.details" record={v} options={options} revalidate={paths} readOnly={!session.can("fleet.details", "edit")} />
        </TabsContent>

        <TabsContent value="inspection" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="font-medium">{t("fleet.internal_renewal_date")}</span>
                <ReminderChip date={(internal?.renewal_date as string) ?? null} />
              </div>
              <SchemaForm schemaKey="fleet.inspection.internal" record={internal ? { ...internal } : { kind: "internal" }} extra={{ ...extra, kind: "internal" }} revalidate={paths} readOnly={!session.can("fleet.inspection_status", "edit")} />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="font-medium">{t("fleet.third_party_next_date")}</span>
                <ReminderChip date={(third?.renewal_date as string) ?? null} />
              </div>
              <SchemaForm schemaKey="fleet.inspection.third_party" record={third ? { ...third } : { kind: "third_party" }} extra={{ ...extra, kind: "third_party" }} revalidate={paths} readOnly={!session.can("fleet.inspection_status", "edit")} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="insurance">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{t("fleet.insurance_end")}</span>
            <ReminderChip date={((insurance as Record<string, unknown> | null)?.end_date as string) ?? null} />
          </div>
          <SchemaForm schemaKey="fleet.insurance" record={insurance as Record<string, unknown> | null} extra={extra} revalidate={paths} readOnly={!session.can("fleet.insurance", "edit")} />
        </TabsContent>

        <TabsContent value="maintenance">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{t("fleet.next_service_km")}</span>
            <KmReminderChip dueKm={((schedule as Record<string, unknown> | null)?.next_service_km as number) ?? null} currentKm={v.odometer_km as number} />
          </div>
          <SchemaForm schemaKey="fleet.maintenance_schedule" record={schedule as Record<string, unknown> | null} extra={extra} revalidate={paths} readOnly={!session.can("fleet.maintenance_schedule", "edit")} />
        </TabsContent>

        <TabsContent value="documents">
          <div className="page-card p-4 md:p-6">
            <h2 className="mb-4 text-base font-semibold">{t("fleet.tab.documents")}</h2>
            <AttachmentsBox table="vehicles" rowId={id} resource="fleet.documents" bucket="vehicle-docs" labels={VEHICLE_DOCUMENTS.map((k) => t(k))} readOnly={!session.can("fleet.documents", "edit") && !session.can("fleet.documents", "create")} />
          </div>
        </TabsContent>

        <TabsContent value="remarks">
          <RemarksThread vehicleId={id} remarks={((remarks ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, body: r.body as string, created_at: r.created_at as string, author: (r.author as { full_name?: string } | null)?.full_name ?? t("common.unknown") }))} canAdd={session.can("fleet.remarks", "create")} />
        </TabsContent>

        <TabsContent value="history" className="grid gap-6 lg:grid-cols-3">
          <HistoryCard title={t("daily_use.km_log.title")} href="/daily-use/km-log" rows={((recentTrips ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, a: formatDate(r.log_date as string), b: `${r.trip_count} ${t("nav.trips").toLowerCase()}`, c: `${formatNumber(r.total_km as number)} km` }))} base="/daily-use/km-log" />
          <HistoryCard title={t("daily_use.fuel.title")} href="/daily-use/fuel-log" rows={((recentFuel ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, a: formatDate(r.issue_date as string), b: `${formatNumber(r.fuel_issued_l as number, 1)} L`, c: r.consumption_km_per_l ? `${formatNumber(r.consumption_km_per_l as number, 2)} km/L` : "" }))} base="/expenses/fuel" linkable={false} />
          <HistoryCard title={t("expenses.maintenance.work_orders.title")} href="/expenses/maintenance/work-orders" rows={((recentWork ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, a: formatDate(r.date_out as string), b: r.garage_name as string, c: r.total_days !== null && r.total_days !== undefined ? `${r.total_days} ${t("common.days")}` : t(`status.${r.status}`) }))} base="/expenses/maintenance/work-orders" />
        </TabsContent>
      </Tabs>
    </>
  );
}

function HistoryCard({ title, href, rows, base, linkable = true }: { title: string; href: string; rows: { id: string; a: string; b: string; c: string }[]; base: string; linkable?: boolean }) {
  return (
    <div className="page-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={href} className="text-xs text-primary underline-offset-4 hover:underline">
          {t("nav.view_all")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("common.empty_title")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
              {linkable ? (
                <Link href={`${base}/${r.id}`} className="text-primary underline-offset-4 hover:underline">
                  {r.a}
                </Link>
              ) : (
                <span>{r.a}</span>
              )}
              <span className="truncate text-muted-foreground">{r.b}</span>
              <span className="tabular-nums">{r.c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
