"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { StatusChip } from "@/components/patterns/status-chip";
import { useCan } from "@/components/permissions/provider";
import { formatDate, formatNumber, formatTzs } from "@/lib/utils";
import { t } from "@/i18n";

export type EmployeeRow = {
  id: string;
  href: string | null;
  employee: string;
  employment_number: string;
  position: string;
  latest: string | null;
  absent: number;
  planned: string;
  taken: string[];
};

const dash = <span className="text-muted-foreground">—</span>;

/** Timesheet: every employee with their latest record, absences and leave from the leave plan. */
export function EmployeesTable({ rows }: { rows: EmployeeRow[] }) {
  const can = useCan();
  const columns = React.useMemo<ColumnDef<EmployeeRow, unknown>[]>(
    () => [
      { id: "employee", header: t("expenses.timesheet.employee_name"), accessorKey: "employee", cell: ({ row }) => <span className="font-medium">{row.original.employee}</span> },
      { id: "employment_number", header: t("timesheet.col.emp_no"), accessorKey: "employment_number", cell: ({ row }) => row.original.employment_number || dash },
      { id: "position", header: t("expenses.timesheet.position"), accessorKey: "position", cell: ({ row }) => row.original.position || dash },
      { id: "latest", header: t("timesheet.col.latest"), accessorKey: "latest", cell: ({ row }) => (row.original.latest ? formatDate(row.original.latest) : dash) },
      {
        id: "absent",
        header: t("timesheet.col.absenteeism"),
        accessorKey: "absent",
        cell: ({ row }) => (row.original.absent ? <StatusChip status="absent" tone="danger" label={t("timesheet.days_count", { count: row.original.absent })} /> : <span className="tabular-nums">0</span>),
      },
      { id: "planned", header: t("timesheet.col.planned_leave"), accessorKey: "planned", cell: ({ row }) => row.original.planned || dash },
      {
        id: "taken",
        header: t("timesheet.col.leave_taken"),
        accessorFn: (r) => r.taken.join("; "),
        cell: ({ row }) =>
          row.original.taken.length ? (
            <span className="block space-y-0.5">
              {row.original.taken.map((d) => (
                <span key={d} className="block whitespace-nowrap">
                  {d}
                </span>
              ))}
            </span>
          ) : (
            dash
          ),
      },
    ],
    [],
  );
  return (
    <DataTable<EmployeeRow>
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchKeys={["employee", "employment_number", "position"]}
      rowHref={(r) => r.href ?? undefined}
      dateFilter={false}
      canExport={can("expenses.timesheet", "export")}
      exportName="timesheet-employees"
      exportTitle={t("expenses.timesheet.title")}
      emptyTitle={t("timesheet.no_employees")}
    />
  );
}

export type DayRow = {
  id: string;
  timesheet_id: string;
  work_date: string;
  day_type: string;
  shift: string;
  time_in: string;
  time_out: string;
  total: number;
  day_time: number;
  night_time: number;
  overtime: number;
  special: number;
  allowance: number;
};

const hours = (v: number) => (v ? `${formatNumber(v, 2)} h` : "—");

/** The days of one employee's month. A row opens its timesheet. */
export function DaysTable({ rows }: { rows: DayRow[] }) {
  const can = useCan();
  const columns = React.useMemo<ColumnDef<DayRow, unknown>[]>(
    () => [
      { id: "work_date", header: t("expenses.timesheet.work_date"), accessorKey: "work_date", cell: ({ row }) => formatDate(row.original.work_date) },
      { id: "weekday", header: t("expenses.timesheet.day"), accessorFn: (r) => new Date(`${r.work_date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }) },
      { id: "day_type", header: t("expenses.timesheet.day_type"), accessorFn: (r) => t(`expenses.timesheet.day_type.${r.day_type}`) },
      { id: "shift", header: t("expenses.timesheet.shift"), accessorFn: (r) => (r.total ? t(`expenses.timesheet.shift.${r.shift}`) : "—") },
      { id: "time_in", header: t("expenses.timesheet.time_in"), accessorKey: "time_in" },
      { id: "time_out", header: t("expenses.timesheet.time_out"), accessorKey: "time_out" },
      { id: "total", header: t("expenses.timesheet.total_hours"), accessorKey: "total", cell: ({ row }) => <span className="tabular-nums">{hours(row.original.total)}</span> },
      { id: "day_time", header: t("expenses.timesheet.day_time"), accessorKey: "day_time", cell: ({ row }) => <span className="tabular-nums">{hours(row.original.day_time)}</span> },
      { id: "night_time", header: t("expenses.timesheet.night_time"), accessorKey: "night_time", cell: ({ row }) => <span className="tabular-nums">{hours(row.original.night_time)}</span> },
      { id: "overtime", header: t("expenses.timesheet.normal_ot"), accessorKey: "overtime", cell: ({ row }) => <span className="tabular-nums">{hours(row.original.overtime)}</span> },
      { id: "special", header: t("expenses.timesheet.special_ot"), accessorKey: "special", cell: ({ row }) => <span className="tabular-nums">{hours(row.original.special)}</span> },
      { id: "allowance", header: t("expenses.timesheet.allowance"), accessorKey: "allowance", cell: ({ row }) => <span className="tabular-nums">{row.original.allowance ? formatTzs(row.original.allowance) : "—"}</span> },
    ],
    [],
  );
  return (
    <DataTable<DayRow>
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/expenses/timesheet/${r.timesheet_id}`}
      dateFilter={false}
      pageSize={31}
      canExport={can("expenses.timesheet", "export")}
      exportName="timesheet-days"
      exportTitle={t("expenses.timesheet.title")}
      emptyTitle={t("timesheet.no_days")}
    />
  );
}
