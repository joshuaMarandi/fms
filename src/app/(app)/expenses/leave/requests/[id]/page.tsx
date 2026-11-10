import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/leave/requests/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.leave.requests" id={id} />;
}
