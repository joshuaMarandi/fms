import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/fuel/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.fuel" id={id} />;
}
