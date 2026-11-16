import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ searchParams }: PageProps<"/expenses/trainings/mandatory/new">) {
  const sp = await searchParams;
  // From a driver's Training records: the driver is filled in.
  const driver = typeof sp.driver === "string" && /^[0-9a-f-]{36}$/i.test(sp.driver) ? sp.driver : null;
  return <ModuleRecordPage moduleKey="expenses.trainings.mandatory" preset={driver ? { driver_id: driver } : undefined} />;
}
