import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/work-orders">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.maintenance.work_orders" searchParams={sp} />;
}
