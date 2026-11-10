import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/leave/plan/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.leave.plan" id={id} />;
}
