import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/daily-use/trip-requests">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="daily_use.trip_requests" searchParams={sp} />;
}
