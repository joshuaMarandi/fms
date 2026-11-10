import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/daily-use/km-log/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="daily_use.km_log" id={id} />;
}
