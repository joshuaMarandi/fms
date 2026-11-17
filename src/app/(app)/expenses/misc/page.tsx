import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/misc">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.misc" searchParams={sp} />;
}
