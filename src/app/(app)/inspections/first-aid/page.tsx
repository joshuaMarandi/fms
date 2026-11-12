import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { t } from "@/i18n";

export default async function Page({ searchParams }: PageProps<"/inspections/first-aid">) {
  const sp = await searchParams;
  return <VehicleRecordsPage moduleKey="inspections.first_aid" searchParams={sp} dateColumn="inspected_on" monthly={false} hubHref="/inspections" hubLabel={t("inspections.title")} />;
}
