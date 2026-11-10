import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/inspections/first-aid">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="inspections.first_aid" searchParams={sp} />;
}
