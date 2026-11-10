import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/maintenance/work-orders/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.maintenance.work_orders" id={id} />;
}
