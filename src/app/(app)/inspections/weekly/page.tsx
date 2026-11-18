import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { WeeklyInspectionHub } from "@/components/hub/inspection-hubs";
import { t } from "@/i18n";

/** Without a vehicle: every vehicle (the weekly inspection database). With one (or "all"): its records. */
export default async function Page({ searchParams }: PageProps<"/inspections/weekly">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <WeeklyInspectionHub searchParams={sp} />;
  return <VehicleRecordsPage moduleKey="inspections.weekly" searchParams={sp} dateColumn="inspection_date" monthly={true} hubHref="/inspections/weekly" hubLabel={t("inspections.weekly.title")} />;
}
