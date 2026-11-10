"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { KmReminderChip, ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { useCan } from "@/components/permissions/provider";
import { formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

export type VehicleRow = {
  id: string;
  registration: string;
  make: string;
  model: string;
  yom: number | null;
  location: string | null;
  odometer_km: number;
  status: string;
  not_safe: boolean;
  open_anomalies: number;
  insurance_end: string | null;
  internal_renewal: string | null;
  third_party_next: string | null;
  next_service_km: number | null;
};

export function VehiclesTable({ rows }: { rows: VehicleRow[] }) {
  const can = useCan();
  const columns = React.useMemo<ColumnDef<VehicleRow, unknown>[]>(
    () => [
      { id: "registration", header: t("fleet.registration"), accessorKey: "registration", cell: ({ row }) => <span className="font-medium">{row.original.registration}</span> },
      { id: "make", header: t("fleet.make"), accessorFn: (r) => `${r.make} ${r.model}` },
      { id: "yom", header: t("fleet.yom"), accessorKey: "yom" },
      { id: "location", header: t("fleet.location"), accessorKey: "location" },
      { id: "odometer_km", header: t("fleet.odometer"), accessorKey: "odometer_km", cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.odometer_km)} km</span> },
      {
        id: "status",
        header: t("fleet.status"),
        accessorFn: (r) => (r.not_safe ? "not_safe" : r.status),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            <StatusChip status={row.original.status} />
            {row.original.not_safe ? <StatusChip status="not_safe" /> : null}
          </span>
        ),
      },
      { id: "open_anomalies", header: t("dashboard.lists.anomalies"), accessorKey: "open_anomalies", cell: ({ row }) => (row.original.open_anomalies > 0 ? <StatusChip status="open" label={String(row.original.open_anomalies)} /> : <span className="text-muted-foreground">0</span>) },
      { id: "insurance_end", header: t("fleet.tab.insurance"), accessorKey: "insurance_end", cell: ({ row }) => <ReminderChip date={row.original.insurance_end} /> },
      { id: "internal_renewal", header: t("fleet.internal_inspection"), accessorKey: "internal_renewal", cell: ({ row }) => <ReminderChip date={row.original.internal_renewal} /> },
      { id: "third_party_next", header: t("fleet.third_party_inspection"), accessorKey: "third_party_next", cell: ({ row }) => <ReminderChip date={row.original.third_party_next} /> },
      { id: "next_service_km", header: t("fleet.next_service_km"), accessorKey: "next_service_km", cell: ({ row }) => <KmReminderChip dueKm={row.original.next_service_km} currentKm={row.original.odometer_km} /> },
    ],
    [],
  );

  return (
    <DataTable<VehicleRow>
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchKeys={["registration", "make", "model", "location"]}
      statusColumn="status"
      statusOptions={["in_service", "in_garage", "out_of_service", "not_safe"]}
      rowHref={(r) => `/fleet/${r.id}`}
      canExport={can("fleet.details", "export")}
      exportName="vehicles"
      exportTitle={t("fleet.title")}
    />
  );
}
