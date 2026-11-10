import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/daily-use/fuel-log">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="daily_use.fuel_log" searchParams={sp} />;
}
