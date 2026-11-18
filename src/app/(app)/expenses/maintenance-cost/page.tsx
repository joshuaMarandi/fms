import { ExpenseHub } from "@/components/hub/expense-hub";
import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { t } from "@/i18n";

/** No vehicle chosen: every vehicle with its totals. A vehicle (or "all"): its records by month. */
export default async function Page({ searchParams }: PageProps<"/expenses/maintenance-cost">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <ExpenseHub kind="maintenance_cost" searchParams={sp} />;
  return <VehicleRecordsPage moduleKey="expenses.maintenance.costs.maintenance" searchParams={sp} dateColumn="cost_date" monthly hubHref="/expenses/maintenance-cost" hubLabel={t("expenses.maintenance_cost.title")} />;
}
