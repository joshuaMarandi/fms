import { redirect } from "next/navigation";
import { ModuleRecordPage } from "@/components/modules/module-record-page";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * A timesheet is one employee's month, shown (and its days added) on the month page; links to a
 * timesheet (emails, the list of all timesheets) open that page. One kept by name only, with no
 * employee account, still opens here.
 */
export default async function Page({ params }: PageProps<"/expenses/timesheet/[id]">) {
  const { id } = await params;
  await requirePermission("expenses.timesheet", "view");
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const supabase = await createClient();
    const { data } = await supabase.from("timesheets").select("employee_id, period_month").eq("id", id).is("deleted_at", null).maybeSingle();
    const ts = data as { employee_id: string | null; period_month: string } | null;
    if (ts?.employee_id) redirect(`/expenses/timesheet?employee=${ts.employee_id}&month=${ts.period_month.slice(0, 7)}`);
  }
  return <ModuleRecordPage moduleKey="expenses.timesheet" id={id} />;
}
