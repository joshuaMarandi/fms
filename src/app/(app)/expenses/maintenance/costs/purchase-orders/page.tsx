import { ModuleListPage } from "@/components/modules/module-list-page";

/** Purchase orders of every vehicle (each vehicle's month shows them in its tab). */
export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/costs/purchase-orders">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.maintenance.purchase_orders" searchParams={sp} />;
}
