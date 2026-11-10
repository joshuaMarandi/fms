import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/daily-use/trip-requests/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="daily_use.trip_requests" id={id} />;
}
