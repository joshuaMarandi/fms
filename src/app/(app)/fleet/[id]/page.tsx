import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SchemaForm } from "@/components/patterns/schema-form";
import { KmReminderChip, ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { VehicleStatus } from "@/components/patterns/vehicle-status";
import { RecordTitle } from "@/components/modules/record-title";
import { PrintButton } from "@/components/shell/print-frame";
import { RemarksThread } from "./remarks-thread";
import { InspectionHistory, type HistoryRow } from "./inspection-history";
import { assignByDate, loadDocs, loadDocsByLabel } from "@/lib/data/docs";
import { Reveal } from "@/components/patterns/reveal";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadOptions } from "@/lib/data/records";
import { formatDate, formatNumber, formatTzs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

export default async function VehiclePage({ params, searchParams }: PageProps<"/fleet/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  // The Documents tab is gone: an old link to it opens Details (where those files now show).
  const tab = typeof sp.tab === "string" && sp.tab !== "documents" ? sp.tab : "details";
  const session = await requirePermission("fleet.details", "view");
  const supabase = await createClient();

  const [{ data: vehicle }, { data: safety }, { data: inspections }, { data: insurance }, { data: schedules }, { data: remarks }, options] = await Promise.all([
    supabase.from("vehicles").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("v_vehicle_safety").select("*").eq("vehicle_id", id).maybeSingle(),
    supabase.from("vehicle_inspections").select("*").eq("vehicle_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("vehicle_insurance").select("*").eq("vehicle_id", id).is("deleted_at", null).order("end_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("service_schedules").select("*").eq("vehicle_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
    supabase.from("vehicle_remarks").select("*, author:profiles!vehicle_remarks_created_by_fkey(full_name)").eq("vehicle_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    loadOptions(["sites"]),
  ]);
  if (!vehicle) notFound();

  const v = vehicle as Record<string, unknown>;
  const safe = safety as { not_safe_for_use: boolean; open_anomalies: number } | null;
  const history = (schedules ?? []) as Record<string, unknown>[];
  const schedule = history[0] ?? null;
  // A new service row, prefilled with today, the current odometer and the last interval.
  const nextService = { last_service_date: todayISO(), last_service_km: v.odometer_km ?? "", interval_km: schedule?.interval_km ?? "" };
  const title = `${v.registration}`;
  const extra = { vehicle_id: id };
  const paths = [`/fleet/${id}`, "/fleet"];

  // Inspection status: every mobilization and third-party inspection, newest first, with documents.
  const mayAttach = (resource: string) => session.can(resource, "edit") || session.can(resource, "create");
  const byDate = (a: { date: string | null }, b: { date: string | null }) => String(b.date ?? "").localeCompare(String(a.date ?? ""));
  const statusRows = (inspections ?? []) as Record<string, unknown>[];
  const mobRows = statusRows.filter((i) => i.kind === "internal");
  const legacyThird = statusRows.filter((i) => i.kind === "third_party");
  const [{ data: thirdRows }, mobDocs, legacyDocs, vehicleDocs] = await Promise.all([
    session.can("inspections.third_party", "view")
      ? supabase.from("third_party_inspections").select("id, inspection_date, renewal_date, inspector").eq("vehicle_id", id).is("deleted_at", null).order("inspection_date", { ascending: false })
      : Promise.resolve({ data: [] }),
    loadDocs("vehicle_inspections", mobRows.map((r) => r.id as string)),
    loadDocs("vehicle_inspections", legacyThird.map((r) => r.id as string)),
    loadDocsByLabel("vehicles", id, [t("fleet.doc.internal_report"), t("fleet.doc.third_party_report"), t("fleet.doc.insurance_policy")]),
  ]);
  const tpList = (thirdRows ?? []) as Record<string, unknown>[];
  const tpDocs = await loadDocs("third_party_inspections", tpList.map((r) => r.id as string));
  const docWith = (key: string) => vehicleDocs.filter((d) => d.label.toLowerCase() === t(key).toLowerCase());
  const withMatched = (rows: HistoryRow[], key: string) => {
    const matched = assignByDate(rows.map((r) => ({ id: r.id, date: r.date })), docWith(key));
    return rows.map((r) => ({ ...r, docs: [...r.docs, ...(matched.get(r.id) ?? [])] }));
  };
  const mobilizationHistory: HistoryRow[] = withMatched(
    mobRows
      .map((r) => ({ id: r.id as string, date: (r.inspection_date as string) ?? null, next: (r.renewal_date as string) ?? null, note: (r.notes as string) ?? null, href: `/inspections/mobilization/${r.id}`, docs: mobDocs.get(r.id as string) ?? [], upload: mayAttach("fleet.inspection_status") ? { table: "vehicle_inspections", rowId: r.id as string, resource: "fleet.inspection_status", bucket: "inspection-scans", label: t("fleet.doc.internal_report") } : null }))
      .sort(byDate),
    "fleet.doc.internal_report",
  );
  const thirdHistory: HistoryRow[] = withMatched(
    [
      ...tpList.map((r) => ({ id: r.id as string, date: (r.inspection_date as string) ?? null, next: (r.renewal_date as string) ?? null, note: (r.inspector as string) ?? null, href: `/inspections/third-party/${r.id}`, docs: tpDocs.get(r.id as string) ?? [], upload: mayAttach("inspections.third_party") ? { table: "third_party_inspections", rowId: r.id as string, resource: "inspections.third_party", bucket: "inspection-scans", label: t("fleet.doc.third_party_report") } : null })),
      ...legacyThird.map((r) => ({ id: r.id as string, date: (r.inspection_date as string) ?? null, next: (r.renewal_date as string) ?? null, note: (r.notes as string) ?? null, href: null, docs: legacyDocs.get(r.id as string) ?? [], upload: mayAttach("fleet.inspection_status") ? { table: "vehicle_inspections", rowId: r.id as string, resource: "fleet.inspection_status", bucket: "inspection-scans", label: t("fleet.doc.third_party_report") } : null })),
    ].sort(byDate),
    "fleet.doc.third_party_report",
  );

  const [{ data: recentTrips }, { data: recentFuel }, { data: recentWork }] = await Promise.all([
    supabase.from("km_logs").select("id, log_date, total_km, trip_count").eq("vehicle_id", id).is("deleted_at", null).order("log_date", { ascending: false }).limit(8),
    supabase.from("fuel_issues").select("id, issue_date, fuel_issued_l, total_cost_tzs, consumption_km_per_l").eq("vehicle_id", id).is("deleted_at", null).order("issue_date", { ascending: false }).limit(8),
    supabase.from("maintenance_costs").select("id, cost_date, service_provider, cost_tzs").eq("vehicle_id", id).is("deleted_at", null).order("cost_date", { ascending: false }).limit(8),
  ]);

  return (
    <>
      <RecordTitle title={title} />
      <PageHeader
        title={`${v.registration}`}
        description={`${v.make} ${v.model}${v.yom ? `, ${v.yom}` : ""}${v.engine_type ? ` · ${t(`engine.${v.engine_type}`)}` : ""} · ${formatNumber(v.odometer_km as number)} km`}
        actions={
          <>
            <PrintButton />
            <VehicleStatus status={v.status as string} reason={v.status_reason as string | null} />
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
          {session.can("fleet.remarks", "view") ? <TabsTrigger value="remarks">{t("fleet.tab.remarks")}</TabsTrigger> : null}
          <TabsTrigger value="history">{t("fleet.tab.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <SchemaForm schemaKey="fleet.details" record={v} options={options} revalidate={paths} readOnly={!session.can("fleet.details", "edit")} />
        </TabsContent>

        <TabsContent value="inspection" className="space-y-6">
          <InspectionHistory
            title={t("inspections.mobilization.title")}
            nextLabel={t("inspections.next_date")}
            noteLabel={null}
            rows={mobilizationHistory}
            report={[]}
            addHref={session.can("fleet.inspection_status", "create") ? `/inspections/mobilization/new?vehicle=${id}` : null}
          />
          <InspectionHistory
            title={t("inspections.third_party.title")}
            nextLabel={t("inspections.next_date")}
            noteLabel={t("inspections.inspector")}
            rows={thirdHistory}
            report={[]}
            addHref={session.can("inspections.third_party", "create") ? `/inspections/third-party/new?vehicle=${id}` : null}
          />
        </TabsContent>

        <TabsContent value="insurance">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{t("fleet.insurance_end")}</span>
            <ReminderChip date={((insurance as Record<string, unknown> | null)?.end_date as string) ?? null} />
          </div>
          <SchemaForm schemaKey="fleet.insurance" record={insurance as Record<string, unknown> | null} extra={extra} revalidate={paths} readOnly={!session.can("fleet.insurance", "edit")} fileFallback={{ policy: docWith("fleet.doc.insurance_policy") }} />
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <div className="page-card flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
            <span className="font-medium">{t("fleet.service.current")}</span>
            {schedule ? (
              <>
                <span>{t("fleet.service.next", { km: formatNumber(schedule.next_service_km as number) })}</span>
                <span className="text-muted-foreground">{t("fleet.service.interval", { km: formatNumber(schedule.interval_km as number) })}</span>
                <KmReminderChip dueKm={(schedule.next_service_km as number) ?? null} currentKm={v.odometer_km as number} />
              </>
            ) : (
              <span className="text-muted-foreground">{t("fleet.service.none")}</span>
            )}
          </div>
          {session.can("fleet.maintenance_schedule", "create") ? (
            <Reveal key={(schedule?.id as string) ?? "first"} label={t("fleet.service.record_title")}>
              <SchemaForm schemaKey="fleet.maintenance_schedule" record={nextService} extra={extra} revalidate={paths} />
            </Reveal>
          ) : null}
          <div className="page-card p-4 md:p-6">
            <h2 className="mb-3 text-base font-semibold">{t("fleet.service.history")}</h2>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("fleet.service.none")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">{t("fleet.last_service_date")}</th>
                      <th className="py-2 pr-3 text-right font-medium">{t("fleet.last_service_km")}</th>
                      <th className="py-2 text-right font-medium">{t("fleet.next_service_km")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={h.id as string} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          {formatDate(h.last_service_date as string)}
                          {i === 0 ? <span className="status-chip status-chip-success ml-2">{t("fleet.service.current")}</span> : null}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(h.last_service_km as number)}</td>
                        <td className="py-2 text-right tabular-nums">{formatNumber(h.next_service_km as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="remarks">
          <RemarksThread vehicleId={id} remarks={((remarks ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, body: r.body as string, created_at: r.created_at as string, author: (r.author as { full_name?: string } | null)?.full_name ?? t("common.unknown") }))} canAdd={session.can("fleet.remarks", "create")} />
        </TabsContent>

        <TabsContent value="history" className="grid gap-6 lg:grid-cols-3">
          <HistoryCard title={t("daily_use.km_log.title")} href="/daily-use/km-log" rows={((recentTrips ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, a: formatDate(r.log_date as string), b: `${r.trip_count} ${t("nav.trips").toLowerCase()}`, c: `${formatNumber(r.total_km as number)} km` }))} base="/daily-use/km-log" />
          <HistoryCard title={t("daily_use.fuel.title")} href="/daily-use/fuel-log" rows={((recentFuel ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, a: formatDate(r.issue_date as string), b: `${formatNumber(r.fuel_issued_l as number, 1)} L`, c: r.consumption_km_per_l ? `${formatNumber(r.consumption_km_per_l as number, 2)} km/L` : "" }))} base="/expenses/fuel" linkable={false} />
          <HistoryCard title={t("expenses.maintenance.costs.title")} href="/expenses/maintenance/costs" rows={((recentWork ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, a: formatDate(r.cost_date as string), b: (r.service_provider as string) ?? "", c: formatTzs(r.cost_tzs as number) }))} base="/expenses/maintenance/costs" />
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
