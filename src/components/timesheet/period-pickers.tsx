"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InHeader } from "@/components/shell/header-tools";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { t } from "@/i18n";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      next.set(key, value);
      startNavigationProgress();
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, sp],
  );
}

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** The month shown (YYYY-MM), in the top bar: previous, pick a month, next. */
export function MonthPicker({ month }: { month: string }) {
  const set = useSetParam();
  return (
    <InHeader>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="size-10" onClick={() => set("month", shift(month, -1))} aria-label={t("timesheet.previous_month")}>
          <ChevronLeft />
        </Button>
        <Input type="month" className="h-10 w-[150px]" value={month} aria-label={t("expenses.timesheet.period")} onChange={(e) => e.target.value && set("month", e.target.value)} />
        <Button type="button" variant="outline" size="icon" className="size-10" onClick={() => set("month", shift(month, 1))} aria-label={t("timesheet.next_month")}>
          <ChevronRight />
        </Button>
      </div>
    </InHeader>
  );
}

/** The year shown, in the top bar. */
export function YearPicker({ year, years }: { year: number; years: number[] }) {
  const set = useSetParam();
  return (
    <InHeader>
      <Select value={String(year)} onValueChange={(v) => v && set("year", v)}>
        <SelectTrigger className="h-10 w-[110px]" aria-label={t("timesheet.year")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </InHeader>
  );
}

/** Opens an employee's month (where their days are added), also for someone with no timesheet yet. */
export function EmployeePicker({ employees }: { employees: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <Select
      onValueChange={(id) => {
        startNavigationProgress();
        router.push(`/expenses/timesheet?employee=${id}`);
      }}
    >
      <SelectTrigger className="h-10 w-full sm:w-72" aria-label={t("timesheet.open_employee")}>
        <SelectValue placeholder={t("timesheet.open_employee")} />
      </SelectTrigger>
      <SelectContent>
        {employees.map((e) => (
          <SelectItem key={e.value} value={e.value}>
            {e.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
