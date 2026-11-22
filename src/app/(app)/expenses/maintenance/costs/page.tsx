import { ExpenseHub } from "@/components/hub/expense-hub";
import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { t } from "@/i18n";

/** No vehicle chosen: every vehicle with its totals. A vehicle (or "all"): its records by month. */
export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/costs">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <ExpenseHub kind="maintenance_records" searchParams={sp} />;
  return <VehicleRecordsPage moduleKey="expenses.maintenance.costs" searchParams={sp} dateColumn="cost_date" monthly landOnMonth hubHref="/expenses/maintenance/costs" hubLabel={t("expenses.maintenance.costs.title")} />;
}
