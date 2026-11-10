import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/equipment">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.equipment" searchParams={sp} />;
}
