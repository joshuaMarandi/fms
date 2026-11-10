import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { SchemaForm } from "@/components/patterns/schema-form";
import { ApprovalPanel, type RequestLike } from "@/components/patterns/approval-panel";
import { RecordTitle } from "./record-title";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadOptions } from "@/lib/data/records";
import { getModule } from "@/modules/registry";
import { allFields } from "@/lib/forms/schema";
import { DetailExtra } from "@/modules/extras";
import { t } from "@/i18n";

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

export async function ModuleRecordPage({ moduleKey, id }: { moduleKey: string; id?: string }) {
  const def = getModule(moduleKey);
  const session = await requirePermission(def.resource, id ? "view" : "create");
  const supabase = await createClient();

  const [record, options] = await Promise.all([id ? loadRecordWithChildren(moduleKey, id) : Promise.resolve(null), loadOptions(def.optionSources)]);
  if (id && !record) notFound();

  const status = (record?.status as string | undefined) ?? undefined;
  const locked = !!record && !!def.isRequest && !!def.editableStatuses && !def.editableStatuses.includes(status ?? "");
  const title = record ? def.titleOf(record) || t(def.title) : t(def.newLabel);

  let approverName: string | null = null;
  if (record?.approved_by) {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", record.approved_by as string).maybeSingle();
    approverName = (data?.full_name as string) ?? null;
  }

  const canApproveOrEdit = session.can(def.resource, "edit") || session.can(def.resource, "approve");
  const showApproval = def.isRequest && record;

  return (
    <>
      <RecordTitle title={record ? title : null} />
      <PageHeader title={title} description={t(def.description)} />
      <div className={showApproval ? "grid gap-6 lg:grid-cols-3" : undefined}>
        <div className={showApproval ? "lg:col-span-2" : undefined}>
          <SchemaForm
            schema={def.schema}
            record={record}
            options={options}
            readOnly={locked}
            cancelHref={def.path}
            afterSave={(newId) => `${def.path}/${newId}`}
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
              canSubmit={canApproveOrEdit && (record.created_by === session.userId || session.can(def.resource, "edit"))}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
