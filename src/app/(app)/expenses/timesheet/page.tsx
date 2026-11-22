import { ModuleListPage } from "@/components/modules/module-list-page";
import { TimesheetEmployeeMonth, TimesheetEmployees } from "@/components/timesheet/timesheet-pages";

/** No employee chosen: every employee. An employee: their month. "all": every timesheet record. */
export default async function Page({ searchParams }: PageProps<"/expenses/timesheet">) {
  const sp = await searchParams;
  const employee = typeof sp.employee === "string" ? sp.employee : undefined;
  if (!employee) return <TimesheetEmployees searchParams={sp} />;
  if (employee === "all") return <ModuleListPage moduleKey="expenses.timesheet" searchParams={sp} />;
  return <TimesheetEmployeeMonth employeeId={employee} searchParams={sp} />;
}
