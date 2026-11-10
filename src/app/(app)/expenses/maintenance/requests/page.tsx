import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/requests">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.maintenance.requests" searchParams={sp} />;
}
