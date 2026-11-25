import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { SchemaForm } from "@/components/patterns/schema-form";
import { ApprovalPanel, type RequestLike, type StepSignoff } from "@/components/patterns/approval-panel";
import { STAGED_STEPS } from "@/lib/approval-steps";
import { RecordTitle } from "./record-title";
import { PrintButton } from "@/components/shell/print-frame";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadOptions } from "@/lib/data/records";
import { getModule } from "@/modules/registry";
import { allFields } from "@/lib/forms/schema";
import { DetailExtra, enrichRecord } from "@/modules/extras";
import { DriverConfirmationCard } from "./driver-confirmation";
import { t } from "@/i18n";

const DOCUMENT_TABLES = new Set(["vehicle_requests", "fuel_requests", "leave_requests"]);

export async function loadRecordWithChildren(moduleKey: string, id: string) {
  const def = getModule(moduleKey);
  const supabase = await createClient();
  const { data: record } = await supabase.from(def.table).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!record) return null;
  const rec = record as Record<string, unknown>;
  const rowFields = allFields(def.schema).filter((f) => f.control === "rows");
  await Promise.all(
    rowFields.map(async (f) => {
      if (f.control !== "rows") return;
      let q = supabase.from(f.childTable).select("*").eq(f.fk, id).is("deleted_at", null).order("created_at");
      for (const [k, v] of Object.entries(f.childFilter ?? {})) q = q.eq(k, v);
      const { data } = await q;
      rec[f.name] = data ?? [];
    }),
  );
  return rec;
}

export async function ModuleRecordPage({ moduleKey, id, preset }: { moduleKey: string; id?: string; preset?: Record<string, unknown> }) {
  const def = getModule(moduleKey);
  const session = await requirePermission(def.resource, id ? "view" : "create");
  const supabase = await createClient();

  // Requests have a printable document and keep a record of who viewed them.
  const isRequestDoc = DOCUMENT_TABLES.has(def.table);
  const [record, options] = await Promise.all([
    id ? loadRecordWithChildren(moduleKey, id) : Promise.resolve(null),
    loadOptions(def.optionSources),
    id && isRequestDoc ? supabase.rpc("log_record_view", { p_table: def.table, p_id: id }) : Promise.resolve(null),
  ]);
  if (id && !record) notFound();
  if (record && def.enrich) await enrichRecord(def.enrich, record);

  const status = (record?.status as string | undefined) ?? undefined;
  const locked = !!record && !!def.isRequest && !!def.editableStatuses && !def.editableStatuses.includes(status ?? "");
  const title = record ? def.titleOf(record) || t(def.title) : t(def.newLabel);

  let approverName: string | null = null;
  if (record?.approved_by) {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", record.approved_by as string).maybeSingle();
    approverName = (data?.full_name as string) ?? null;
  }

  // Requests with several steps: who signed the earlier ones.
  let signoffs: StepSignoff[] = [];
  if (record && STAGED_STEPS[def.table]) {
    const { data } = await supabase.from("approval_signoffs").select("step, signer_name, created_at").eq("table_name", def.table).eq("record_id", record.id as string).order("created_at");
    signoffs = (data ?? []) as StepSignoff[];
  }

  const canApproveOrEdit = session.can(def.resource, "edit") || session.can(def.resource, "approve");
  const showApproval = def.isRequest && record;

  return (
    <>
      <RecordTitle title={record ? title : null} />
      <PageHeader
        title={title}
        description={record ? undefined : t(def.description)}
        actions={
          record ? (
            isRequestDoc ? (
              <Button asChild variant="outline" className="h-10">
                <Link href={`/documents/${def.table}/${record.id}`} target="_blank">
                  <FileText /> {t("doc.open_document")}
                </Link>
              </Button>
            ) : (
              <PrintButton />
            )
          ) : undefined
        }
      />
      {record ? <DriverConfirmationCard table={def.table} id={record.id as string} /> : null}
      <div className={showApproval ? "grid gap-6 lg:grid-cols-3" : undefined}>
        <div className={showApproval ? "lg:col-span-2" : undefined}>
          <SchemaForm
            schemaKey={def.key}
            record={record ?? (preset || def.fixed ? { ...def.fixed, ...preset } : null)}
            extra={def.fixed}
            options={options}
            readOnly={locked}
            cancelHref={def.path}
            afterSavePath={def.path}
            revalidate={[def.path]}
          />
          {def.detailExtra && record ? <DetailExtra name={def.detailExtra} record={record} options={options} /> : null}
        </div>
        {showApproval ? (
          <div className="space-y-6">
            <ApprovalPanel
              table={def.table}
              resource={def.resource}
              request={record as unknown as RequestLike}
              approverName={approverName}
              extraFields={def.approvalExtra ? def.approvalExtra(options, record) : undefined}
              revalidate={[def.path, `${def.path}/${record.id}`]}
              signoffs={signoffs}
              canSubmit={
                (canApproveOrEdit && (record.created_by === session.userId || session.can(def.resource, "edit"))) ||
                (!!def.schema.creatorEditsDraft && (def.schema.creatorEditsDraft === "anyone" || record.created_by === session.userId) && session.can(def.resource, "create"))
              }
            />
            {def.sideExtra ? <DetailExtra name={def.sideExtra} record={record} options={options} /> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
