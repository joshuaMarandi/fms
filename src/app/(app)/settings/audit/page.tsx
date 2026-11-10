import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AuditTable, type AuditRow } from "./audit-table";
import { t } from "@/i18n";

export default async function AuditPage() {
  await requirePermission("settings.audit", "view");
  const supabase = await createClient();
  const { data } = await supabase.from("audit_log").select("id, created_at, actor_id, action, table_name, row_id, before, after").order("created_at", { ascending: false }).limit(1000);
  const actorIds = Array.from(new Set(((data ?? []) as { actor_id: string | null }[]).map((r) => r.actor_id).filter(Boolean))) as string[];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const names = new Map(((actors ?? []) as { id: string; full_name: string }[]).map((a) => [a.id, a.full_name]));

  const rows: AuditRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    created_at: r.created_at as string,
    actor: r.actor_id ? names.get(r.actor_id as string) ?? t("common.unknown") : "System",
    action: r.action as string,
    table_name: r.table_name as string,
    row_id: (r.row_id as string) ?? "",
    before: (r.before as Record<string, unknown>) ?? null,
    after: (r.after as Record<string, unknown>) ?? null,
  }));

  return (
    <>
      <PageHeader title={t("settings.audit.title")} description={t("settings.audit.description")} />
      <AuditTable rows={rows} />
    </>
  );
}
