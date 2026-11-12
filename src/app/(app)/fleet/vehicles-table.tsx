"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { KmReminderChip, ReminderChip } from "@/components/patterns/status-chip";
import { VehicleStatus } from "@/components/patterns/vehicle-status";
import { useCan } from "@/components/permissions/provider";
import { formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

export type VehicleRow = {
  id: string;
  registration: string;
  make: string;
  model: string;
  yom: number | null;
  owner_name: string | null;
  location: string | null;
  odometer_km: number;
  status: string;
  status_reason: string | null;
  not_safe: boolean;
  insurance_end: string | null;
  third_party_next: string | null;
  next_service_km: number | null;
};

export function VehiclesTable({ rows }: { rows: VehicleRow[] }) {
  const can = useCan();
  const columns = React.useMemo<ColumnDef<VehicleRow, unknown>[]>(
    () => [
      { id: "registration", header: t("fleet.reg"), accessorKey: "registration", cell: ({ row }) => <span className="font-medium">{row.original.registration}</span> },
      { id: "make", header: t("fleet.make_model"), accessorFn: (r) => `${r.make} ${r.model}` },
      { id: "yom", header: t("fleet.yom"), accessorKey: "yom" },
      { id: "owner_name", header: t("fleet.owner"), accessorKey: "owner_name" },
      { id: "location", header: t("fleet.location"), accessorKey: "location" },
      { id: "odometer_km", header: t("fleet.km_to_date"), accessorKey: "odometer_km", cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.odometer_km)} km</span> },
      { id: "next_service_km", header: t("fleet.next_service_at"), accessorKey: "next_service_km", cell: ({ row }) => <KmReminderChip dueKm={row.original.next_service_km} currentKm={row.original.odometer_km} showKm /> },
      { id: "insurance_end", header: t("fleet.insurance_until"), accessorKey: "insurance_end", cell: ({ row }) => <ReminderChip date={row.original.insurance_end} showDate /> },
      { id: "third_party_next", header: t("fleet.third_party_next"), accessorKey: "third_party_next", cell: ({ row }) => <ReminderChip date={row.original.third_party_next} showDate /> },
      {
        id: "status",
        header: t("fleet.status"),
        accessorFn: (r) => (r.not_safe ? "not_safe" : r.status),
        cell: ({ row }) => <VehicleStatus status={row.original.status} reason={row.original.status_reason} notSafe={row.original.not_safe} />,
      },
    ],
    [],
  );

  return (
    <DataTable<VehicleRow>
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchKeys={["registration", "make", "model", "location", "owner_name"]}
      statusColumn="status"
      statusOptions={["in_service", "out_of_service", "not_safe"]}
      rowHref={(r) => `/fleet/${r.id}`}
      canExport={can("fleet.details", "export")}
      exportName="vehicles"
      exportTitle={t("fleet.title")}
    />
  );
}
