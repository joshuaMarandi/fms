import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/inspections/first-aid/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="inspections.first_aid" id={id} />;
}
