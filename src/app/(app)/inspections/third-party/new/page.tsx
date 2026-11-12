import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ searchParams }: PageProps<"/inspections/third-party/new">) {
  const sp = await searchParams;
  const vehicle = typeof sp.vehicle === "string" && /^[0-9a-f-]{36}$/i.test(sp.vehicle) ? sp.vehicle : null;
  return <ModuleRecordPage moduleKey="inspections.third_party" preset={vehicle ? { vehicle_id: vehicle } : undefined} />;
}
