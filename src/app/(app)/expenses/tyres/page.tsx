import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/tyres">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.tyres" searchParams={sp} />;
}
