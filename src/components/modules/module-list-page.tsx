import { PageHeader } from "@/components/shell/page-header";
import { HeaderDates } from "@/components/shell/header-tools";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getModule } from "@/modules/registry";
import { ModuleTable } from "./module-table";
import { ListExtra } from "@/modules/extras";
import { loadDocs } from "@/lib/data/docs";
import { t } from "@/i18n";

export async function ModuleListPage({ moduleKey, searchParams }: { moduleKey: string; searchParams?: Record<string, string | string[] | undefined> }) {
  const def = getModule(moduleKey);
  await requirePermission(def.resource, "view");
  const supabase = await createClient();

  let query = supabase.from(def.table).select(def.list.select).is("deleted_at", null);
  for (const [k, v] of Object.entries(def.list.eq ?? {})) query = query.eq(k, v);
  if (def.list.orderBy) query = query.order(def.list.orderBy.column, { ascending: def.list.orderBy.ascending ?? true });
  query = query.limit(1000);
  const { data, error } = await query;

  const rows = ((data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>).map((r) => (def.list.derive ? { ...r, ...def.list.derive(r) } : r));
  const docsCol = def.list.columns.find((c) => c.type === "docs");
  if (docsCol && rows.length) {
    const docs = await loadDocs(def.table, rows.map((r) => r.id));
    for (const r of rows) r[docsCol.key] = docs.get(r.id) ?? [];
  }

  return (
    <>
      <PageHeader
        title={t(def.title)}
        description={t(def.description)}
      />
      {def.landOn ? <HeaderDates first={def.landOn} defaultMonth={def.landOn === "month"} defaultDay={def.landOn === "day"} /> : null}
      {def.listExtra ? <ListExtra name={def.listExtra} searchParams={searchParams} landOn={def.landOn} /> : null}
      {error ? <p className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error.message}</p> : null}
      <ModuleTable moduleKey={def.key} rows={rows} />
    </>
  );
}
