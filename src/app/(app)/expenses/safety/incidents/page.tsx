import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/safety/incidents">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.safety.incidents" searchParams={sp} />;
}
