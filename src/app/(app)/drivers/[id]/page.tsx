import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SchemaForm } from "@/components/patterns/schema-form";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { RecordTitle } from "@/components/modules/record-title";
import { PrintButton } from "@/components/shell/print-frame";
import { Button } from "@/components/ui/button";
import { CoursesEditor } from "./courses-editor";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadOptions } from "@/lib/data/records";
import { DRIVER_DOCUMENTS } from "@/modules/drivers";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export default async function DriverPage({ params, searchParams }: PageProps<"/drivers/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "personal";
  const session = await requirePermission("drivers.personal", "view");
  const supabase = await createClient();

  const [{ data: driver }, { data: courses }, { data: licence }, { data: osha }, { data: trainings }, options] = await Promise.all([
    supabase.from("drivers").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("driver_courses").select("*").eq("driver_id", id).not("course", "is", null).is("deleted_at", null).order("date_completed", { ascending: false }),
    supabase.from("driver_licences").select("*").eq("driver_id", id).is("deleted_at", null).order("expiry_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("driver_osha").select("*").eq("driver_id", id).is("deleted_at", null).order("redo_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("mandatory_trainings").select("id, courses, date_completed, refresher_date, trainer").eq("driver_id", id).is("deleted_at", null).order("date_completed", { ascending: false }),
    loadOptions(["profiles"]),
  ]);
  if (!driver) notFound();
  const d = driver as Record<string, unknown>;
  const extra = { driver_id: id };
  const paths = [`/drivers/${id}`, "/drivers"];
  const courseRows = (courses ?? []) as Record<string, unknown>[];

  return (
    <>
      <RecordTitle title={d.full_name as string} />
      <PageHeader
        title={d.full_name as string}
        description={[d.job_title, d.employer, d.phone].filter(Boolean).join(" · ")}
        actions={
          <>
            <PrintButton />
            <StatusChip status={d.is_active ? "active" : "inactive"} />
          </>
        }
      />
      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start overflow-x-auto">
          <TabsTrigger value="personal">{t("drivers.tab.personal")}</TabsTrigger>
          {session.can("drivers.training", "view") ? <TabsTrigger value="training">{t("drivers.tab.training")}</TabsTrigger> : null}
          {session.can("drivers.licence", "view") ? <TabsTrigger value="licence">{t("drivers.tab.licence")}</TabsTrigger> : null}
          {session.can("drivers.osha", "view") ? <TabsTrigger value="osha">{t("drivers.tab.osha")}</TabsTrigger> : null}
          {session.can("drivers.documents", "view") ? <TabsTrigger value="documents">{t("drivers.tab.documents")}</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="personal">
          <SchemaForm schemaKey="drivers.personal" record={d} options={options} revalidate={paths} readOnly={!session.can("drivers.personal", "edit")} />
        </TabsContent>

        <TabsContent value="training" className="space-y-6">
          <CoursesEditor key={courseRows.map((c) => `${c.id}:${c.updated_at}`).join(",")} driverId={id} rows={courseRows as { id: string; course: string }[]} readOnly={!session.can("drivers.training", "edit") && !session.can("drivers.training", "create")} />
          {trainings && trainings.length > 0 ? (
            <div className="page-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("expenses.trainings.mandatory.title")}</h3>
                <Button asChild variant="link" size="sm">
                  <Link href="/expenses/trainings/mandatory">{t("nav.view_all")}</Link>
                </Button>
              </div>
              <ul className="divide-y text-sm">
                {(trainings as Record<string, unknown>[]).map((tr) => (
                  <li key={tr.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{((tr.courses as string[]) ?? []).map((c) => t(`expenses.trainings.course.${c}`)).join(", ")}</span>
                    <span className="text-muted-foreground">{formatDate(tr.date_completed as string)}</span>
                    <ReminderChip date={tr.refresher_date as string} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="licence">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{t("drivers.expiry_date")}</span>
            <ReminderChip date={((licence as Record<string, unknown> | null)?.expiry_date as string) ?? null} />
          </div>
          <SchemaForm schemaKey="drivers.licence" record={licence as Record<string, unknown> | null} extra={extra} revalidate={paths} readOnly={!session.can("drivers.licence", "edit")} />
          <div className="page-card mt-6 p-4 md:p-6">
            <h3 className="mb-3 text-sm font-semibold">{t("drivers.licence_file")}</h3>
            <AttachmentsBox table="drivers" rowId={id} resource="drivers.licence" bucket="driver-docs" labels={[t("drivers.doc.licence")]} multiple={false} readOnly={!session.can("drivers.licence", "edit")} />
          </div>
        </TabsContent>

        <TabsContent value="osha">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{t("drivers.osha_redo")}</span>
            <ReminderChip date={((osha as Record<string, unknown> | null)?.redo_date as string) ?? null} />
          </div>
          <SchemaForm schemaKey="drivers.osha" record={osha as Record<string, unknown> | null} extra={extra} revalidate={paths} readOnly={!session.can("drivers.osha", "edit")} />
        </TabsContent>

        <TabsContent value="documents">
          <div className="page-card p-4 md:p-6">
            <h2 className="mb-4 text-base font-semibold">{t("drivers.tab.documents")}</h2>
            <AttachmentsBox table="drivers" rowId={id} resource="drivers.documents" bucket="driver-docs" labels={DRIVER_DOCUMENTS.map((k) => t(k))} sensitive readOnly={!session.can("drivers.documents", "edit") && !session.can("drivers.documents", "create")} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
