import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/travel/arrivals/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.travel.arrivals" id={id} />;
}
