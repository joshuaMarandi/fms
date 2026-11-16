import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/administration/outstation">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.admin.outstation" searchParams={sp} />;
}
