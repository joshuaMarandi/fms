"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { useCan } from "@/components/permissions/provider";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type DriverRow = {
  id: string;
  full_name: string;
  phone: string | null;
  employer: string | null;
  employment_number: string | null;
  joining_date: string | null;
  is_active: boolean;
  licence_expiry: string | null;
  osha_redo: string | null;
  ddt_refresher: string | null;
  courses: string[];
};

export function DriversTable({ rows }: { rows: DriverRow[] }) {
  const can = useCan();
  const columns = React.useMemo<ColumnDef<DriverRow, unknown>[]>(
    () => [
      { id: "full_name", header: t("drivers.names"), accessorKey: "full_name", cell: ({ row }) => <span className="font-medium">{row.original.full_name}</span> },
      { id: "employment_number", header: t("drivers.no"), accessorKey: "employment_number" },
      { id: "employer", header: t("drivers.company"), accessorKey: "employer" },
      { id: "joining_date", header: t("drivers.employment_date"), accessorKey: "joining_date", cell: ({ row }) => formatDate(row.original.joining_date) },
      ...(can("drivers.training", "view")
        ? [
            {
              id: "courses",
              header: t("drivers.professional_training"),
              accessorFn: (r: DriverRow) => r.courses.join(", "),
              cell: ({ row }) =>
                row.original.courses.length ? (
                  <span className="flex max-w-[260px] flex-wrap gap-1">
                    {row.original.courses.map((c) => (
                      <span key={c} className="status-chip status-chip-neutral">
                        {c}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("drivers.no_training")}</span>
                ),
            } as ColumnDef<DriverRow, unknown>,
          ]
        : []),
      ...(can("drivers.licence", "view") ? [{ id: "licence_expiry", header: t("drivers.licence_expiry"), accessorKey: "licence_expiry", cell: ({ row }) => <ReminderChip date={row.original.licence_expiry} showDate /> } as ColumnDef<DriverRow, unknown>] : []),
      ...(can("expenses.trainings.mandatory", "view") ? [{ id: "ddt_refresher", header: t("drivers.ddt_refresher"), accessorKey: "ddt_refresher", cell: ({ row }) => <ReminderChip date={row.original.ddt_refresher} showDate /> } as ColumnDef<DriverRow, unknown>] : []),
      ...(can("drivers.osha", "view") ? [{ id: "osha_redo", header: t("drivers.osha_refresher"), accessorKey: "osha_redo", cell: ({ row }) => <ReminderChip date={row.original.osha_redo} showDate /> } as ColumnDef<DriverRow, unknown>] : []),
      { id: "status", header: t("common.status"), accessorFn: (r) => (r.is_active ? "active" : "inactive"), cell: ({ row }) => <StatusChip status={row.original.is_active ? "active" : "inactive"} /> },
    ],
    [can],
  );

  return (
    <DataTable<DriverRow>
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchKeys={["full_name", "phone", "employer", "employment_number"]}
      statusColumn="status"
      statusOptions={["active", "inactive"]}
      rowHref={(r) => `/drivers/${r.id}`}
      canExport={can("drivers.personal", "export")}
      exportName="drivers"
      exportTitle={t("drivers.title")}
    />
  );
}
