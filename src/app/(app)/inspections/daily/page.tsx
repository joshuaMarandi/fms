import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/inspections/daily">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="inspections.daily" searchParams={sp} />;
}
