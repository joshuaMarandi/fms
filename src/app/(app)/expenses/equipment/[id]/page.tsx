import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/equipment/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.equipment" id={id} />;
}
