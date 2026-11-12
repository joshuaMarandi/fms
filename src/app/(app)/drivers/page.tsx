import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DriversTable, type DriverRow } from "./drivers-table";
import { t } from "@/i18n";

export default async function DriversPage() {
  const session = await requirePermission("drivers.personal", "view");
  const supabase = await createClient();

  const [{ data: drivers }, { data: licences }, { data: osha }, { data: trainings }, { data: courses }] = await Promise.all([
    supabase.from("drivers").select("*").is("deleted_at", null).order("full_name"),
    session.can("drivers.licence", "view") ? supabase.from("driver_licences").select("driver_id, expiry_date").is("deleted_at", null).order("expiry_date", { ascending: false }) : Promise.resolve({ data: [] }),
    session.can("drivers.osha", "view") ? supabase.from("driver_osha").select("driver_id, redo_date").is("deleted_at", null).order("redo_date", { ascending: false }) : Promise.resolve({ data: [] }),
    session.can("expenses.trainings.mandatory", "view") ? supabase.from("mandatory_trainings").select("driver_id, refresher_date").contains("courses", ["defensive_driving"]).is("deleted_at", null).order("refresher_date", { ascending: false }) : Promise.resolve({ data: [] }),
    session.can("drivers.training", "view") ? supabase.from("driver_courses").select("driver_id, course, course_other").not("course", "is", null).is("deleted_at", null).order("date_completed", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const courseMap = new Map<string, string[]>();
  for (const c of (courses ?? []) as { driver_id: string; course: string; course_other: string | null }[]) {
    const name = c.course === "other" ? c.course_other || t("drivers.course.other") : t(`drivers.course.${c.course}`);
    courseMap.set(c.driver_id, [...(courseMap.get(c.driver_id) ?? []), name]);
  }

  const latest = <T extends { driver_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T>();
    for (const r of rows ?? []) if (!m.has(r.driver_id)) m.set(r.driver_id, r);
    return m;
  };
  const lic = latest((licences ?? []) as { driver_id: string; expiry_date: string }[]);
  const osh = latest((osha ?? []) as { driver_id: string; redo_date: string }[]);
  const trn = latest((trainings ?? []) as { driver_id: string; refresher_date: string }[]);

  const rows: DriverRow[] = ((drivers ?? []) as Record<string, unknown>[]).map((d) => ({
    id: d.id as string,
    full_name: d.full_name as string,
    phone: (d.phone as string) ?? null,
    employer: (d.employer as string) ?? null,
    employment_number: (d.employment_number as string) ?? null,
    joining_date: (d.joining_date as string) ?? null,
    is_active: d.is_active as boolean,
    licence_expiry: lic.get(d.id as string)?.expiry_date ?? null,
    osha_redo: osh.get(d.id as string)?.redo_date ?? null,
    ddt_refresher: trn.get(d.id as string)?.refresher_date ?? null,
    courses: courseMap.get(d.id as string) ?? [],
  }));

  return (
    <>
      <PageHeader
        title={t("drivers.title")}
        description={t("drivers.description")}
        actions={
          session.can("drivers.personal", "create") ? (
            <Button asChild className="h-10">
              <Link href="/drivers/new">
                <Plus /> {t("drivers.add_driver")}
              </Link>
            </Button>
          ) : null
        }
      />
      <DriversTable rows={rows} />
    </>
  );
}
