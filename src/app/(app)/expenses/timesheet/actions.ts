"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toISODate } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

export type DayInput = {
  work_date: string;
  day_type: string;
  shift: string;
  time_in: string;
  break_from: string;
  break_to: string;
  time_out: string;
  overtime_hours: string;
  special_overtime_hours: string;
  allowance_tzs: string;
};

const DAY_TYPES = new Set(["work", "rest", "leave", "public_holiday", "sick", "absent"]);
const SHIFTS = new Set(["day", "noon", "night"]);
const UUID = /^[0-9a-f-]{36}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const time = (v: string) => (TIME.test(v) ? v : null);
const hours = (v: string) => (v.trim() === "" ? 0 : Math.min(Math.max(Number(v) || 0, 0), 24));

function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return toISODate(new Date(y, m, 0));
}

/**
 * Adds or changes one day of an employee's month. The month's timesheet is made with its first day
 * (one per employee and month). Days can change until the employee signs the month.
 */
export async function saveTimesheetDay(employeeId: string, month: string, dayId: string | null, d: DayInput): Promise<Result> {
  await requirePermission("expenses.timesheet", dayId ? "edit" : "create");
  if (!UUID.test(employeeId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Choose the employee and the month." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.work_date) || d.work_date < `${month}-01` || d.work_date > lastDay(month)) return { ok: false, error: "Pick a date in this month." };
  if (!DAY_TYPES.has(d.day_type) || !SHIFTS.has(d.shift)) return { ok: false, error: "Choose the type of day and the shift." };
  const worked = !["rest", "leave", "sick", "absent"].includes(d.day_type);
  if (worked && (!time(d.time_in) || !time(d.time_out))) return { ok: false, error: "Enter the time in and the time out." };
  const allowance = d.allowance_tzs.trim() === "" ? 0 : Number(d.allowance_tzs);
  if (!Number.isFinite(allowance) || allowance < 0) return { ok: false, error: "The allowance must be 0 or more." };

  const supabase = await createClient();
  const period = `${month}-01`;
  let { data: sheet } = await supabase.from("timesheets").select("id, status").eq("employee_id", employeeId).eq("period_month", period).is("deleted_at", null).maybeSingle();
  if (!sheet) {
    const { data: person } = await supabase.from("profiles").select("full_name").eq("id", employeeId).maybeSingle();
    if (!person) return { ok: false, error: "Employee not found." };
    const { data, error } = await supabase
      .from("timesheets")
      .insert({ employee_id: employeeId, employee_name: (person as { full_name: string }).full_name, period_month: period, status: "draft" })
      .select("id, status")
      .single();
    if (error) return { ok: false, error: error.code === "23505" ? "This month was just started by someone else. Refresh the page." : error.message };
    sheet = data;
  }
  const s = sheet as { id: string; status: string };
  if (s.status !== "draft" && s.status !== "rejected") return { ok: false, error: "The employee has signed this month. It can no longer be changed." };

  const row = {
    timesheet_id: s.id,
    work_date: d.work_date,
    day_type: d.day_type,
    shift: d.shift,
    time_in: worked ? time(d.time_in) : null,
    time_out: worked ? time(d.time_out) : null,
    break_from: worked ? time(d.break_from) : null,
    break_to: worked ? time(d.break_to) : null,
    overtime_hours: worked ? hours(d.overtime_hours) : 0,
    special_overtime_hours: worked ? hours(d.special_overtime_hours) : 0,
    allowance_tzs: allowance,
  };
  const { error } = dayId ? await supabase.from("timesheet_days").update(row).eq("id", dayId).eq("timesheet_id", s.id) : await supabase.from("timesheet_days").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? "This date is already on the timesheet. Change that day instead." : error.message };
  revalidatePath("/expenses/timesheet");
  return { ok: true };
}

/** Removes a day (until the employee signs the month). */
export async function deleteTimesheetDay(dayId: string): Promise<Result> {
  await requirePermission("expenses.timesheet", "edit");
  if (!UUID.test(dayId)) return { ok: false, error: "Day not found." };
  const supabase = await createClient();
  const { data: day } = await supabase.from("timesheet_days").select("id, timesheet:timesheets!inner(status)").eq("id", dayId).maybeSingle();
  const status = (day as { timesheet: { status: string } } | null)?.timesheet.status;
  if (!status) return { ok: false, error: "Day not found." };
  if (status !== "draft" && status !== "rejected") return { ok: false, error: "The employee has signed this month. It can no longer be changed." };
  const { error } = await supabase.from("timesheet_days").delete().eq("id", dayId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses/timesheet");
  return { ok: true };
}
