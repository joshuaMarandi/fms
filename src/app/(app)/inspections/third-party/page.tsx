import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { t } from "@/i18n";

export default async function Page({ searchParams }: PageProps<"/inspections/third-party">) {
  const sp = await searchParams;
  return <VehicleRecordsPage moduleKey="inspections.third_party" searchParams={sp} dateColumn="inspection_date" monthly={false} hubHref="/inspections" hubLabel={t("inspections.title")} />;
}
