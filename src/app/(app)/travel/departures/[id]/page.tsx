import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/travel/departures/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.travel.departures" id={id} />;
}
