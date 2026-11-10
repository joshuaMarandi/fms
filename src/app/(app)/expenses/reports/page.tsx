import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ReportBuilder, type Preset } from "./report-builder";
import { t } from "@/i18n";

export default async function ReportsPage() {
  const session = await requirePermission("expenses.reports", "view");
  const supabase = await createClient();
  const [{ data: presets }, { data: vehicles }, { data: drivers }] = await Promise.all([
    supabase.from("report_presets").select("id, name, report_type, filters").is("deleted_at", null).order("name"),
    supabase.from("vehicles").select("id, registration").is("deleted_at", null).order("registration"),
    supabase.from("drivers").select("id, full_name").is("deleted_at", null).order("full_name"),
  ]);
  const types = ["fuel", "fleet_cost", "maintenance", "compliance", "training", "leave", "timesheet", "incidents"].filter((ty) => {
    const res: Record<string, string> = { fuel: "expenses.fuel", fleet_cost: "expenses", maintenance: "expenses.maintenance", compliance: "fleet", training: "expenses.trainings", leave: "expenses.leave", timesheet: "expenses.timesheet", incidents: "expenses.safety" };
    return session.can(res[ty]!, "view");
  });
  return (
    <>
      <PageHeader title={t("expenses.reports.title")} description={t("expenses.reports.description")} />
      <ReportBuilder
        types={types}
        presets={(presets ?? []) as Preset[]}
        vehicles={(vehicles ?? []) as { id: string; registration: string }[]}
        drivers={(drivers ?? []) as { id: string; full_name: string }[]}
        canExport={session.can("expenses.reports", "export")}
        companyId={session.profile.company_id!}
      />
    </>
  );
}
