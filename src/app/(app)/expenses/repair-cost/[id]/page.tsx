import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/repair-cost/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.maintenance.costs.repairs" id={id} />;
}
