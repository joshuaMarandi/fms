import { redirect } from "next/navigation";

/** Days are added on the employee's month page (the month's timesheet is made with its first day). */
export default async function Page({ searchParams }: PageProps<"/expenses/timesheet/new">) {
  const sp = await searchParams;
  const employee = typeof sp.employee === "string" && /^[0-9a-f-]{36}$/i.test(sp.employee) ? sp.employee : null;
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null;
  redirect(employee ? `/expenses/timesheet?employee=${employee}${month ? `&month=${month}` : ""}` : "/expenses/timesheet");
}
