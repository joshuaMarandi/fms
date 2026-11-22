import { ExpenseHub } from "@/components/hub/expense-hub";
import { VehicleRecordsPage } from "@/components/hub/vehicle-records-page";
import { t } from "@/i18n";

/** No vehicle chosen: every vehicle with its totals. A vehicle (or "all"): its records by month. */
export default async function Page({ searchParams }: PageProps<"/expenses/fuel">) {
  const sp = await searchParams;
  if (!sp.vehicle) return <ExpenseHub kind="fuel_cost" searchParams={sp} />;
  return <VehicleRecordsPage moduleKey="expenses.fuel" searchParams={sp} dateColumn="expense_date" monthly landOnMonth hubHref="/expenses/fuel" hubLabel={t("expenses.fuel.title")} />;
}
