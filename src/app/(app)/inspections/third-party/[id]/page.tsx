import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/inspections/third-party/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="inspections.third_party" id={id} />;
}
