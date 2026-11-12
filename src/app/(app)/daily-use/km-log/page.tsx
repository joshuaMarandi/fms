import { DailyUseHub } from "@/components/hub/daily-use-hub";
import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { getModule } from "@/modules/registry";
import { t } from "@/i18n";

/** No vehicle chosen: the vehicle hub. A vehicle (or "all"): its records, filtered by month. */
export default async function Page({ searchParams }: PageProps<"/daily-use/km-log">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <DailyUseHub kind="km_log" />;
  const def = getModule("daily_use.km_log");
  return <VehicleRecordsPage moduleKey="daily_use.km_log" searchParams={sp} dateColumn="log_date" monthly hubHref="/daily-use/km-log" hubLabel={t(def.title)} />;
}
