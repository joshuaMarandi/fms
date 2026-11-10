import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/inspections/third-party">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="inspections.third_party" searchParams={sp} />;
}
