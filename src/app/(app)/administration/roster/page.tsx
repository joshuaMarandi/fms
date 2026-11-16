import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/administration/roster">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.admin.roster" searchParams={sp} />;
}
