import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/maintenance/costs/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.maintenance.costs" id={id} />;
}
