import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getModule } from "@/modules/registry";
import { ModuleTable } from "./module-table";
import { ListExtra } from "@/modules/extras";
import { t } from "@/i18n";

export async function ModuleListPage({ moduleKey, searchParams }: { moduleKey: string; searchParams?: Record<string, string | string[] | undefined> }) {
  const def = getModule(moduleKey);
  const session = await requirePermission(def.resource, "view");
  const supabase = await createClient();

  let query = supabase.from(def.table).select(def.list.select).is("deleted_at", null);
  for (const [k, v] of Object.entries(def.list.eq ?? {})) query = query.eq(k, v);
  if (def.list.orderBy) query = query.order(def.list.orderBy.column, { ascending: def.list.orderBy.ascending ?? true });
  query = query.limit(1000);
  const { data, error } = await query;

  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>;

  return (
    <>
      <PageHeader
        title={t(def.title)}
        description={t(def.description)}
        actions={
          session.can(def.resource, "create") ? (
            <Button asChild className="h-10">
              <Link href={`${def.path}/new`}>
                <Plus /> {t(def.newLabel)}
              </Link>
            </Button>
          ) : null
        }
      />
      {def.listExtra ? <ListExtra name={def.listExtra} searchParams={searchParams} /> : null}
      {error ? <p className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error.message}</p> : null}
      <ModuleTable moduleKey={def.key} rows={rows} />
    </>
  );
}
