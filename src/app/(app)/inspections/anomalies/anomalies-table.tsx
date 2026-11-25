"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { StatusChip } from "@/components/patterns/status-chip";
import { CloseAnomalyDialog } from "@/components/inspections/close-anomaly-dialog";
import { Button } from "@/components/ui/button";
import { daysUntil, formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type AnomalyRow = {
  id: string;
  vehicle: string;
  driver: string;
  description: string;
  action_required: string;
  action_taken: string;
  when_to_act: string;
  status: string;
  date_opened: string;
  date_closed: string | null;
  inspection_href: string;
};

export function AnomaliesTable({ rows, canClose }: { rows: AnomalyRow[]; canClose: boolean }) {
  const router = useRouter();
  const [closing, setClosing] = React.useState<AnomalyRow | null>(null);

  const columns = React.useMemo<ColumnDef<AnomalyRow, unknown>[]>(
    () => [
      { id: "date_opened", header: t("inspections.anomaly.date_opened"), accessorKey: "date_opened", cell: ({ row }) => formatDate(row.original.date_opened) },
      { id: "vehicle", header: t("inspections.vehicle"), accessorKey: "vehicle", cell: ({ row }) => <Link href={row.original.inspection_href} className="font-medium text-primary underline-offset-4 hover:underline">{row.original.vehicle}</Link> },
      { id: "description", header: t("inspections.anomaly.description"), accessorKey: "description", cell: ({ row }) => <span className="block max-w-[360px] whitespace-normal">{row.original.description}</span> },
      {
        id: "action_required",
        header: t("inspections.col.action_required"),
        accessorKey: "action_required",
        cell: ({ row }) => <span className={`block max-w-[280px] whitespace-normal ${row.original.status === "open" ? "font-medium text-danger" : ""}`}>{row.original.action_required}</span>,
      },
      {
        id: "action_taken",
        header: t("inspections.col.action_taken"),
        accessorKey: "action_taken",
        cell: ({ row }) => (row.original.status === "closed" ? <span className="block max-w-[280px] whitespace-normal font-medium text-success">{row.original.action_taken || row.original.action_required}</span> : <span className="text-muted-foreground">—</span>),
      },
      {
        id: "when_to_act",
        header: t("inspections.anomaly.when"),
        accessorKey: "when_to_act",
        cell: ({ row }) => <StatusChip status={row.original.when_to_act} tone={row.original.when_to_act === "immediately" ? "danger" : row.original.when_to_act === "before_next_service" ? "warning" : "neutral"} label={t(`inspections.anomaly.when.${row.original.when_to_act}`)} />,
      },
      {
        id: "status",
        header: t("common.status"),
        accessorKey: "status",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <StatusChip status={row.original.status} />
            {row.original.status === "open" ? <span className="text-xs text-muted-foreground">{t("inspections.anomaly.days_open", { days: Math.abs(daysUntil(row.original.date_opened) ?? 0) })}</span> : null}
          </span>
        ),
      },
      { id: "date_closed", header: t("inspections.anomaly.date_closed"), accessorKey: "date_closed", cell: ({ row }) => formatDate(row.original.date_closed) },
      ...(canClose
        ? [
            {
              id: "_close",
              header: "",
              enableSorting: false,
              enableHiding: false,
              cell: ({ row }) =>
                row.original.status === "open" ? (
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setClosing(row.original); }}>
                    {t("inspections.anomaly.close")}
                  </Button>
                ) : null,
            } as ColumnDef<AnomalyRow, unknown>,
          ]
        : []),
    ],
    [canClose],
  );

  return (
    <>
      <DataTable<AnomalyRow> columns={columns} data={rows} getRowId={(r) => r.id} searchKeys={["vehicle", "description", "action_required"]} statusColumn="status" statusOptions={["open", "closed"]} exportName="anomalies" canExport />
      <CloseAnomalyDialog
        anomaly={closing ? { id: closing.id, description: closing.description, action_required: closing.action_required, date_opened: closing.date_opened } : null}
        onOpenChange={(o) => !o && setClosing(null)}
        onClosed={() => router.refresh()}
        revalidate={["/inspections/daily", "/inspections/weekly", "/inspections/third-party", "/inspections/mobilization"]}
      />
    </>
  );
}
