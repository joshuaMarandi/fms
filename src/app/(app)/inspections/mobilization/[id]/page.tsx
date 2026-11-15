import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/inspections/mobilization/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="inspections.mobilization" id={id} />;
}
