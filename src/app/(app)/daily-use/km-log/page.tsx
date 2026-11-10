import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/daily-use/km-log">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="daily_use.km_log" searchParams={sp} />;
}
