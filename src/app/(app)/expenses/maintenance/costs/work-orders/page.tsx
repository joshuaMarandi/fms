import { ModuleListPage } from "@/components/modules/module-list-page";

/** Work orders of every vehicle (each vehicle's month shows them in its tab). */
export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/costs/work-orders">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.maintenance.work_orders" searchParams={sp} />;
}
