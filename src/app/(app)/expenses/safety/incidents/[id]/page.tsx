import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/safety/incidents/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.safety.incidents" id={id} />;
}
