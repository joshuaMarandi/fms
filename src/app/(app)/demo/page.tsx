import { PageHeader } from "@/components/shell/page-header";
import { Can } from "@/components/permissions/provider";
import { SchemaForm } from "@/components/patterns/schema-form";
import { ApprovalPanel } from "@/components/patterns/approval-panel";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { KmReminderChip, ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { ModuleTable } from "@/components/modules/module-table";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadOptions } from "@/lib/data/records";
import { getModule } from "@/modules/registry";
import { daysFromNowISO } from "@/lib/utils";
import { t } from "@/i18n";

/** One page that uses every reusable pattern with real permission checks (step 5 acceptance). */
export default async function DemoPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const def = getModule("daily_use.fuel_log");
  const [{ data: rows }, options, { data: request }] = await Promise.all([
    supabase.from(def.table).select(def.list.select).is("deleted_at", null).order("request_date", { ascending: false }).limit(10),
    loadOptions(def.optionSources),
    supabase.from("fuel_requests").select("*").is("deleted_at", null).eq("status", "submitted").limit(1).maybeSingle(),
  ]);
  const inThirty = daysFromNowISO(10);
  const past = daysFromNowISO(-5);
  const farAway = daysFromNowISO(200);

  return (
    <>
      <PageHeader title={t("demo.title")} description={t("demo.description")} />
      <section className="page-card space-y-3 p-4">
        <h2 className="text-sm font-semibold">{t("common.status")}</h2>
        <div className="flex flex-wrap gap-2">
          {["draft", "submitted", "approved", "rejected", "open", "closed", "not_safe"].map((s) => (
            <StatusChip key={s} status={s} />
          ))}
          <ReminderChip date={inThirty} />
          <ReminderChip date={past} />
          <ReminderChip date={farAway} />
          <KmReminderChip dueKm={85000} currentKm={84700} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("profile.role")}: {session.roles.map((r) => r.name).join(", ")}
        </p>
      </section>

      <Can resource="daily_use.fuel_log" action="view" fallback={<p className="page-card p-4 text-sm text-muted-foreground">{t("common.no_access_description")}</p>}>
        <ModuleTable moduleKey={def.key} rows={(rows ?? []) as unknown as Array<Record<string, unknown> & { id: string }>} />
      </Can>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Can resource="daily_use.fuel_log" action="create" fallback={<p className="page-card p-4 text-sm text-muted-foreground">{t("common.permission_denied")}</p>}>
            <SchemaForm schema={def.schema} options={options} cancelHref="/demo" afterSave={(id) => `/daily-use/fuel-log/${id}`} />
          </Can>
        </div>
        <div className="space-y-6">
          {request ? <ApprovalPanel table="fuel_requests" resource="daily_use.fuel_log" request={request as never} extraFields={def.approvalExtra?.(options, request as Record<string, unknown>)} revalidate={["/demo"]} /> : null}
          <div className="page-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("attachments.title")}</h2>
            <AttachmentsBox table="fuel_requests" rowId={(request as { id?: string } | null)?.id ?? null} resource="daily_use.fuel_log" bucket="forms" labels={[t("daily_use.fuel.title")]} />
          </div>
        </div>
      </div>
    </>
  );
}
