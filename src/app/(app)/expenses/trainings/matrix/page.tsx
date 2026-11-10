import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

const COURSES = ["defensive_driving", "four_wd", "fatigue", "night_driving"];

/** Placeholder page: a driver by course grid until the client's matrix format arrives. */
export default async function TrainingMatrixPage() {
  await requirePermission("expenses.trainings.matrix", "view");
  const supabase = await createClient();
  const [{ data: drivers }, { data: trainings }] = await Promise.all([
    supabase.from("drivers").select("id, full_name").is("deleted_at", null).eq("is_active", true).order("full_name"),
    supabase.from("mandatory_trainings").select("driver_id, courses, date_completed, refresher_date").is("deleted_at", null).order("date_completed", { ascending: false }),
  ]);
  const rows = (trainings ?? []) as { driver_id: string; courses: string[]; date_completed: string | null; refresher_date: string | null }[];
  const cell = (driverId: string, course: string) => rows.find((r) => r.driver_id === driverId && (r.courses ?? []).includes(course));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title={t("expenses.trainings.matrix.title")} description={t("expenses.trainings.matrix.description")} />
      <Alert>
        <AlertDescription>{t("expenses.trainings.matrix.placeholder")}</AlertDescription>
      </Alert>
      <div className="page-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">{t("inspections.driver_name")}</th>
              {COURSES.map((c) => (
                <th key={c} className="p-3 font-medium">
                  {t(`expenses.trainings.course.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {((drivers ?? []) as { id: string; full_name: string }[]).map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-3 font-medium">{d.full_name}</td>
                {COURSES.map((c) => {
                  const r = cell(d.id, c);
                  const expired = r?.refresher_date ? r.refresher_date < today : false;
                  return (
                    <td key={c} className="p-3">
                      {r ? (
                        <span className={`status-chip ${expired ? "status-chip-danger" : "status-chip-success"}`}>
                          {formatDate(r.date_completed)}
                          {r.refresher_date ? ` · ${t("expenses.trainings.refresher")}: ${formatDate(r.refresher_date)}` : ""}
                        </span>
                      ) : (
                        <span className="status-chip status-chip-neutral">{t("status.not_started")}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
