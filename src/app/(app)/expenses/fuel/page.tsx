import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/fuel">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.fuel" searchParams={sp} />;
}
