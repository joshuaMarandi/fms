import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/administration/roster/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.admin.roster" id={id} />;
}
