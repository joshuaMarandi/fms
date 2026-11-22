import { ModuleListPage } from "@/components/modules/module-list-page";
import { HeaderDates } from "@/components/shell/header-tools";

export default async function Page({ searchParams }: PageProps<"/daily-use/trip-requests">) {
  const sp = await searchParams;
  return (
    <>
      {/* The date filter offers one exact date first. */}
      <HeaderDates first="day" />
      <ModuleListPage moduleKey="daily_use.trip_requests" searchParams={sp} />
    </>
  );
}
