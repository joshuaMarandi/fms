import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { YearlyInspectionHub } from "@/components/hub/inspection-hubs";
import { t } from "@/i18n";

/** Without a vehicle: every vehicle. With one (or "all"): its records, by year. */
export default async function Page({ searchParams }: PageProps<"/inspections/third-party">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <YearlyInspectionHub kind="third_party" />;
  return <VehicleRecordsPage moduleKey="inspections.third_party" searchParams={sp} dateColumn="inspection_date" monthly={false} yearly hubHref="/inspections/third-party" hubLabel={t("inspections.third_party.title")} />;
}
