import { DailyUseHub } from "@/components/hub/daily-use-hub";
import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { t } from "@/i18n";

/** Fuel log (fuel issued). No vehicle chosen: the vehicle hub. A vehicle (or "all"): its refills by month. */
export default async function Page({ searchParams }: PageProps<"/daily-use/fuel-log">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <DailyUseHub kind="fuel_issues" searchParams={sp} />;
  return <VehicleRecordsPage moduleKey="daily_use.fuel_issues" searchParams={sp} dateColumn="issue_date" monthly landOnMonth hubHref="/daily-use/fuel-log" hubLabel={t("daily_use.fuel_issues.title")} />;
}
