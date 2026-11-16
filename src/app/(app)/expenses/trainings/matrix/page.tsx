import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ToolboxMatrix, type MatrixTalk } from "./toolbox-matrix";
import { t } from "@/i18n";

/** Toolbox matrix: every active driver against the latest toolbox talks, with who attended. */
export default async function ToolboxMatrixPage() {
  const session = await requirePermission("expenses.trainings.matrix", "view");
  const supabase = await createClient();
  const [{ data: drivers }, { data: talks }, { data: attendance }] = await Promise.all([
    supabase.from("drivers").select("id, full_name").is("deleted_at", null).eq("is_active", true).order("full_name"),
    supabase.from("toolbox_plans").select("id, week_number, month, date_from, date_to, topics").is("deleted_at", null).order("date_from", { ascending: false, nullsFirst: false }).limit(12),
    supabase.from("toolbox_attendance").select("id, toolbox_plan_id, driver_id, attended").is("deleted_at", null).limit(5000),
  ]);
  const talkList = ((talks ?? []) as MatrixTalk[]).reverse();
  const ids = new Set(talkList.map((x) => x.id));

  return (
    <>
      <PageHeader title={t("expenses.trainings.matrix.title")} description={t("expenses.trainings.matrix.description")} />
      <ToolboxMatrix
        drivers={(drivers ?? []) as { id: string; full_name: string }[]}
        talks={talkList}
        attendance={((attendance ?? []) as { id: string; toolbox_plan_id: string; driver_id: string; attended: boolean }[]).filter((a) => ids.has(a.toolbox_plan_id))}
        canEdit={session.can("expenses.trainings.matrix", "edit") || session.can("expenses.trainings.matrix", "create")}
      />
    </>
  );
}
