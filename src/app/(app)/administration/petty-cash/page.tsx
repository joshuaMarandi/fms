import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/administration/petty-cash">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.admin.petty_cash" searchParams={sp} />;
}
