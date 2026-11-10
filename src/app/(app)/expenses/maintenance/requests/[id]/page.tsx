import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/maintenance/requests/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.maintenance.requests" id={id} />;
}
