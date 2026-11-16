import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { DailyInspectionHub } from "@/components/hub/inspection-hubs";
import { t } from "@/i18n";

/** Without a vehicle: every vehicle (the daily pre-start database). With one (or "all"): its records. */
export default async function Page({ searchParams }: PageProps<"/inspections/daily">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <DailyInspectionHub />;
  return <VehicleRecordsPage moduleKey="inspections.daily" searchParams={sp} dateColumn="inspection_date" monthly={true} hubHref="/inspections/daily" hubLabel={t("inspections.daily.short_title")} />;
}
