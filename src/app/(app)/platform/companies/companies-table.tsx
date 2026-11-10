"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { formatDate } from "@/lib/utils";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { enterCompany } from "../actions";
import { t } from "@/i18n";

type Row = {
  id: string;
  name: string;
  status: string;
  package_name: string | null;
  max_vehicles: number | null;
  contact_name: string | null;
  contact_email: string | null;
  city: string | null;
  subscription_end: string | null;
  created_at: string;
  vehicles: number;
  users: number;
  drivers: number;
  last_activity: string | null;
};

const TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { pending: "warning", trial: "info", active: "success", suspended: "danger", cancelled: "neutral" };

export function CompaniesTable({ rows }: { rows: Row[] }) {
  const [, start] = React.useTransition();
  const open = (id: string) => {
    startNavigationProgress();
    start(() => enterCompany(id));
  };
  const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: "name", header: t("platform.companies.name"), accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: "package_name", header: t("platform.companies.package"), accessorFn: (r) => r.package_name ?? t("platform.companies.no_package") },
      { id: "status", header: t("platform.companies.status"), accessorKey: "status", cell: ({ row }) => <StatusChip status={row.original.status} tone={TONES[row.original.status]} label={t(`platform.status.${row.original.status}`)} /> },
      {
        id: "vehicles",
        header: t("platform.companies.vehicles"),
        accessorKey: "vehicles",
        cell: ({ row }) => {
          const r = row.original;
          const over = r.max_vehicles !== null && r.vehicles >= r.max_vehicles;
          return <span className={`tabular-nums ${over ? "status-chip status-chip-warning" : ""}`}>{r.max_vehicles ? `${r.vehicles} / ${r.max_vehicles}` : r.vehicles}</span>;
        },
      },
      { id: "users", header: t("platform.companies.users"), accessorKey: "users", cell: ({ row }) => <span className="tabular-nums">{row.original.users}</span> },
      { id: "drivers", header: t("platform.companies.drivers"), accessorKey: "drivers", cell: ({ row }) => <span className="tabular-nums">{row.original.drivers}</span> },
      { id: "contact", header: t("platform.companies.contact_name"), accessorFn: (r) => [r.contact_name, r.contact_email].filter(Boolean).join(", ") },
      { id: "city", header: t("platform.companies.city"), accessorKey: "city" },
      { id: "subscription_end", header: t("platform.companies.subscription_end"), accessorKey: "subscription_end", cell: ({ row }) => (row.original.subscription_end ? <ReminderChip date={row.original.subscription_end} /> : <span className="text-muted-foreground">{t("subscription.no_end")}</span>) },
      { id: "last_activity", header: t("platform.companies.last_activity"), accessorKey: "last_activity", cell: ({ row }) => formatDate(row.original.last_activity) },
      { id: "created_at", header: t("platform.companies.created"), accessorKey: "created_at", cell: ({ row }) => formatDate(row.original.created_at) },
    ],
    [],
  );
  return (
    <DataTable<Row>
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchKeys={["name", "package_name", "contact_name", "contact_email", "city"]}
      statusColumn="status"
      statusOptions={["active", "trial", "pending", "suspended", "cancelled"]}
      onRowClick={(r) => open(r.id)}
      rowActions={[
        { label: t("platform.companies.enter"), onSelect: (r) => open(r.id) },
        { label: t("platform.companies.manage"), href: (r) => `/platform/companies/${r.id}` },
      ]}
      canExport
      exportName="companies"
      exportTitle={t("platform.companies.title")}
    />
  );
}
