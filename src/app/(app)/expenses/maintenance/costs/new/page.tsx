import { ModuleRecordPage } from "@/components/modules/module-record-page";

/** New job card. Opened from a vehicle's month: the vehicle (and a date in that month) are filled in. */
export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/costs/new">) {
  const sp = await searchParams;
  const vehicle = typeof sp.vehicle === "string" && /^[0-9a-f-]{36}$/i.test(sp.vehicle) ? sp.vehicle : null;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const preset = { ...(vehicle ? { vehicle_id: vehicle } : {}), ...(date ? { cost_date: date } : {}) };
  return <ModuleRecordPage moduleKey="expenses.maintenance.costs" preset={Object.keys(preset).length ? preset : undefined} />;
}
