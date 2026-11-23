"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveTimesheetDay, type DayInput } from "@/app/(app)/expenses/timesheet/actions";
import { SHIFT_TIMES, SHIFTS, type Shift } from "@/lib/timesheet-hours";
import { t } from "@/i18n";

const DAY_TYPES = ["work", "rest", "leave", "public_holiday", "sick", "absent"] as const;
const OFF_DAYS = new Set(["rest", "leave", "sick", "absent"]);

export type DayValues = DayInput & { id?: string };

/** One day of the month: added or changed in a small form on the employee's month page. */
export function DayDialog({
  open,
  onOpenChange,
  employeeId,
  month,
  day,
  nextDate,
  lastShift,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  month: string;
  /** The day to change; none to add a new one. */
  day?: DayValues | null;
  /** For a new day: the date after the last one recorded (or the first of the month). */
  nextDate: string;
  lastShift: Shift;
}) {
  const router = useRouter();
  // A fresh form each time it opens (the page gives it a new key).
  const [v, setV] = React.useState<DayValues>(
    () => day ?? { work_date: nextDate, day_type: "work", shift: lastShift, ...SHIFT_TIMES[lastShift], overtime_hours: "", special_overtime_hours: "", allowance_tzs: "" },
  );
  const [busy, setBusy] = React.useState(false);

  const set = (k: keyof DayInput, val: string) => setV((x) => ({ ...x, [k]: val }));
  const off = OFF_DAYS.has(v.day_type);
  const last = `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;

  async function save(addAnother: boolean) {
    setBusy(true);
    const res = await saveTimesheetDay(employeeId, month, day?.id ?? null, v);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(day ? t("timesheet.day_saved") : t("timesheet.day_added"));
    router.refresh();
    if (addAnother && v.work_date < last) {
      const next = new Date(`${v.work_date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      setV({ ...v, work_date: next.toISOString().slice(0, 10) });
    } else onOpenChange(false);
  }

  const time = (k: "time_in" | "break_from" | "break_to" | "time_out", label: string) => (
    <Field>
      <FieldLabel htmlFor={`day-${k}`}>{t(label)}</FieldLabel>
      <Input id={`day-${k}`} type="time" className="h-11" value={v[k]} onChange={(e) => set(k, e.target.value)} disabled={off} />
    </Field>
  );
  const num = (k: "overtime_hours" | "special_overtime_hours" | "allowance_tzs", label: string, step: number) => (
    <Field>
      <FieldLabel htmlFor={`day-${k}`}>{t(label)}</FieldLabel>
      <Input id={`day-${k}`} type="number" inputMode="decimal" min={0} step={step} className="h-11" value={v[k]} onChange={(e) => set(k, e.target.value)} disabled={off && k !== "allowance_tzs"} />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{day ? t("timesheet.change_day") : t("expenses.timesheet.add_day")}</DialogTitle>
          <DialogDescription>{t("timesheet.day_dialog_hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="day-date">{t("expenses.timesheet.work_date")}</FieldLabel>
            <Input id="day-date" type="date" className="h-11" min={`${month}-01`} max={last} value={v.work_date} onChange={(e) => set("work_date", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="day-type">{t("expenses.timesheet.day_type")}</FieldLabel>
            <Select value={v.day_type} onValueChange={(x) => set("day_type", x)}>
              <SelectTrigger id="day-type" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_TYPES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {t(`expenses.timesheet.day_type.${d}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="day-shift">{t("expenses.timesheet.shift")}</FieldLabel>
            <Select
              value={v.shift}
              disabled={off}
              onValueChange={(x) => setV((cur) => ({ ...cur, shift: x, ...SHIFT_TIMES[x as Shift] }))}
            >
              <SelectTrigger id="day-shift" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIFTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`expenses.timesheet.shift.${s}`)} ({SHIFT_TIMES[s].time_in}–{SHIFT_TIMES[s].time_out})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {time("time_in", "expenses.timesheet.time_in")}
          {time("time_out", "expenses.timesheet.time_out")}
          {time("break_from", "expenses.timesheet.break_from")}
          {time("break_to", "expenses.timesheet.break_to")}
          {num("overtime_hours", "expenses.timesheet.normal_ot", 0.25)}
          {num("special_overtime_hours", "expenses.timesheet.special_ot", 0.25)}
          {num("allowance_tzs", "expenses.timesheet.allowance", 100)}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {!day ? (
            <Button type="button" variant="outline" className="h-11" onClick={() => save(true)} disabled={busy}>
              {t("timesheet.save_add_next")}
            </Button>
          ) : null}
          <Button type="button" className="h-11" onClick={() => save(false)} disabled={busy}>
            {busy ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
