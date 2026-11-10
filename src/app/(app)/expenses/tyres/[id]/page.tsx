import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/expenses/tyres/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.tyres" id={id} />;
}
