import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { t } from "@/i18n";

export default async function Page({ searchParams }: PageProps<"/inspections/daily">) {
  const sp = await searchParams;
  return <VehicleRecordsPage moduleKey="inspections.daily" searchParams={sp} dateColumn="inspection_date" monthly={true} hubHref="/inspections" hubLabel={t("inspections.title")} />;
}
