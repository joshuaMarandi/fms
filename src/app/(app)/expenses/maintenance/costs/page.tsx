import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/costs">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.maintenance.costs" searchParams={sp} />;
}
