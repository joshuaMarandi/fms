import { DailyUseHub } from "@/components/hub/daily-use-hub";
import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { getModule } from "@/modules/registry";
import { t } from "@/i18n";

/** No vehicle chosen: the vehicle hub. A vehicle (or "all"): its records, filtered by month. */
export default async function Page({ searchParams }: PageProps<"/daily-use/fuel-requests">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <DailyUseHub kind="fuel_log" searchParams={sp} />;
  const def = getModule("daily_use.fuel_log");
  return <VehicleRecordsPage moduleKey="daily_use.fuel_log" searchParams={sp} dateColumn="request_date" monthly landOnMonth hubHref="/daily-use/fuel-requests" hubLabel={t(def.title)} />;
}
