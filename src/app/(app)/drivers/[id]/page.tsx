import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SchemaForm } from "@/components/patterns/schema-form";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { RecordTitle } from "@/components/modules/record-title";
import { PrintButton } from "@/components/shell/print-frame";
import { CoursesEditor } from "./courses-editor";
import { MandatoryTrainings, type MandatoryRow } from "./mandatory-trainings";
import { DriverHistory } from "./driver-history";
import { Reveal } from "@/components/patterns/reveal";
import { loadDocsByLabel } from "@/lib/data/docs";
import { formatDate } from "@/lib/utils";
import { loadDocs } from "@/lib/data/docs";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadOptions } from "@/lib/data/records";
import { DRIVER_DOCUMENTS } from "@/modules/drivers";
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
    supabase.from("driver_licences").select("*").eq("driver_id", id).is("deleted_at", null).order("expiry_date", { ascending: false }),
    supabase.from("driver_osha").select("*").eq("driver_id", id).is("deleted_at", null).order("date_conducted", { ascending: false, nullsFirst: false }),
    supabase.from("mandatory_trainings").select("id, courses, date_completed, refresher_date, trainer").eq("driver_id", id).is("deleted_at", null).order("date_completed", { ascending: false }),
    loadOptions(["profiles"]),
  ]);
  if (!driver) notFound();
  const d = driver as Record<string, unknown>;
  const extra = { driver_id: id };
  const paths = [`/drivers/${id}`, "/drivers"];
  const courseRows = (courses ?? []) as Record<string, unknown>[];
  // Licence and OSHA: every record (newest first). The form edits the newest one.
  const licenceRows = (licence ?? []) as Record<string, unknown>[];
  const oshaRows = (osha ?? []) as Record<string, unknown>[];
  const currentLicence = licenceRows[0] ?? null;
  const currentOsha = oshaRows[0] ?? null;
  // Each record's own file, plus the matching file from the Documents tab shown on the newest record.
  const [licenceDocs, oshaDocs, driverDocs] = await Promise.all([
    session.can("drivers.licence", "view") ? loadDocs("driver_licences", licenceRows.map((r) => r.id as string)) : Promise.resolve(new Map()),
    session.can("drivers.osha", "view") ? loadDocs("driver_osha", oshaRows.map((r) => r.id as string)) : Promise.resolve(new Map()),
    loadDocsByLabel("drivers", id, [t("drivers.doc.licence"), t("drivers.doc.osha_report")]),
  ]);
  const fromTab = (key: string) => driverDocs.filter((d) => d.label.toLowerCase() === t(key).toLowerCase());
  const mandatoryRows = (trainings ?? []) as MandatoryRow[];
  const [courseDocs, mandatoryDocs] = await Promise.all([loadDocs("driver_courses", courseRows.map((c) => c.id as string)), loadDocs("mandatory_trainings", mandatoryRows.map((r) => r.id))]);

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
          <CoursesEditor
            key={courseRows.map((c) => `${c.id}:${c.updated_at}`).join(",")}
            driverId={id}
            rows={courseRows as { id: string; course: string }[]}
            readOnly={!session.can("drivers.training", "edit") && !session.can("drivers.training", "create")}
            docs={Object.fromEntries(courseDocs)}
            canAttach={session.can("drivers.training", "edit") || session.can("drivers.training", "create")}
          />
          {session.can("expenses.trainings.mandatory", "view") ? (
            <MandatoryTrainings
              driverId={id}
              rows={mandatoryRows}
              docs={mandatoryDocs}
              canAdd={session.can("expenses.trainings.mandatory", "create")}
              canAttach={session.can("expenses.trainings.mandatory", "edit") || session.can("expenses.trainings.mandatory", "create")}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="licence">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{t("drivers.expiry_date")}</span>
            <ReminderChip date={(currentLicence?.expiry_date as string) ?? null} />
          </div>
          <SchemaForm key={(currentLicence?.id as string) ?? "new"} schemaKey="drivers.licence" record={currentLicence} extra={extra} revalidate={paths} readOnly={!session.can("drivers.licence", "edit")} />
          {currentLicence && session.can("drivers.licence", "create") ? (
            <div className="mt-4">
              <Reveal label={t("drivers.licence.add")}>
                <SchemaForm schemaKey="drivers.licence" record={null} extra={extra} revalidate={paths} />
              </Reveal>
            </div>
          ) : null}
          <DriverHistory
            title={t("drivers.licence.history")}
            headers={[t("drivers.licence_number"), t("drivers.licence_class"), t("drivers.date_issued"), t("drivers.expiry_date")]}
            docHeader={t("drivers.doc.licence")}
            rows={licenceRows.map((r, i) => ({
              id: r.id as string,
              current: i === 0,
              cells: [(r.licence_number as string) || "—", (r.licence_class as string) || "—", formatDate(r.date_issued as string), <ReminderChip key="exp" date={(r.expiry_date as string) ?? null} showDate />],
              docs: [...(licenceDocs.get(r.id as string) ?? []), ...(i === 0 ? fromTab("drivers.doc.licence") : [])],
            }))}
          />
        </TabsContent>

        <TabsContent value="osha">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{t("drivers.osha_redo")}</span>
            <ReminderChip date={(currentOsha?.redo_date as string) ?? null} />
          </div>
          <SchemaForm key={(currentOsha?.id as string) ?? "new"} schemaKey="drivers.osha" record={currentOsha} extra={extra} revalidate={paths} readOnly={!session.can("drivers.osha", "edit")} />
          {currentOsha && session.can("drivers.osha", "create") ? (
            <div className="mt-4">
              <Reveal label={t("drivers.osha.add")}>
                <SchemaForm schemaKey="drivers.osha" record={null} extra={extra} revalidate={paths} />
              </Reveal>
            </div>
          ) : null}
          <DriverHistory
            title={t("drivers.osha.history")}
            headers={[t("drivers.osha_date"), t("drivers.osha_redo"), t("drivers.osha_result")]}
            docHeader={t("drivers.osha.report")}
            rows={oshaRows.map((r, i) => ({
              id: r.id as string,
              current: i === 0,
              cells: [formatDate(r.date_conducted as string), <ReminderChip key="redo" date={(r.redo_date as string) ?? null} showDate />, (r.result as string) || "—"],
              docs: [...(oshaDocs.get(r.id as string) ?? []), ...(i === 0 ? fromTab("drivers.doc.osha_report") : [])],
            }))}
          />
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
