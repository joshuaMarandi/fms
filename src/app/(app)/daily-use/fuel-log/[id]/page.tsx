import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/daily-use/fuel-log/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="daily_use.fuel_log" id={id} />;
}
