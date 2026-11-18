import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/travel/arrivals">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.travel.arrivals" searchParams={sp} />;
}
