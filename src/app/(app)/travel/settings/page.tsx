import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/travel/settings">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.travel.settings" searchParams={sp} />;
}
