import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { YearlyInspectionHub } from "@/components/hub/inspection-hubs";
import { t } from "@/i18n";

/** Without a vehicle: every vehicle. With one (or "all"): its mobilization inspections, by year. */
export default async function Page({ searchParams }: PageProps<"/inspections/mobilization">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <YearlyInspectionHub kind="mobilization" />;
  return <VehicleRecordsPage moduleKey="inspections.mobilization" searchParams={sp} dateColumn="inspection_date" monthly={false} yearly hubHref="/inspections/mobilization" hubLabel={t("inspections.mobilization.title")} />;
}
