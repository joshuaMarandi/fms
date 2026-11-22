import { ModuleRecordPage } from "@/components/modules/module-record-page";

/** Opened from an employee's month: the employee and the month are filled in. */
export default async function Page({ searchParams }: PageProps<"/expenses/timesheet/new">) {
  const sp = await searchParams;
  const employee = typeof sp.employee === "string" && /^[0-9a-f-]{36}$/i.test(sp.employee) ? sp.employee : null;
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? `${sp.month}-01` : null;
  const preset = { ...(employee ? { employee_id: employee } : {}), ...(month ? { period_month: month } : {}) };
  return <ModuleRecordPage moduleKey="expenses.timesheet" preset={Object.keys(preset).length ? preset : undefined} />;
}
