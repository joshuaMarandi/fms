"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/patterns/data-table";
import { StatusChip } from "@/components/patterns/status-chip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type AuditRow = { id: string; created_at: string; actor: string; action: string; table_name: string; row_id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null };

const TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { approve: "success", reject: "danger", delete: "danger", grant_change: "warning", role_create: "info", role_update: "warning", role_delete: "danger", user_role_assign: "info", user_role_remove: "warning", ceiling_change: "warning", sign_jmp: "success" };

function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const rows: { key: string; before: string; after: string }[] = [];
  for (const k of keys) {
    if (["updated_at", "updated_by", "created_at"].includes(k)) continue;
    const b = JSON.stringify(before?.[k] ?? null);
    const a = JSON.stringify(after?.[k] ?? null);
    if (b !== a) rows.push({ key: k, before: b, after: a });
  }
  return rows;
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [open, setOpen] = React.useState<AuditRow | null>(null);
  const columns = React.useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      { id: "created_at", header: t("settings.audit.when"), accessorKey: "created_at", cell: ({ row }) => formatDate(row.original.created_at, true) },
      { id: "actor", header: t("settings.audit.who"), accessorKey: "actor" },
      { id: "action", header: t("settings.audit.action"), accessorKey: "action", cell: ({ row }) => <StatusChip status={row.original.action} tone={TONE[row.original.action] ?? "neutral"} label={row.original.action.replace(/_/g, " ")} /> },
      { id: "table_name", header: t("settings.audit.table"), accessorKey: "table_name" },
      { id: "row_id", header: t("settings.audit.record"), accessorKey: "row_id", cell: ({ row }) => <span className="font-mono text-xs">{row.original.row_id.slice(0, 8)}</span> },
      { id: "_changes", header: t("settings.audit.changes"), enableSorting: false, cell: ({ row }) => <Button variant="link" size="sm" onClick={() => setOpen(row.original)}>{t("common.view")}</Button> },
    ],
    [],
  );
  return (
    <>
      <DataTable<AuditRow> columns={columns} data={rows} getRowId={(r) => r.id} searchKeys={["actor", "action", "table_name", "row_id"]} statusColumn="action" exportName="audit-log" canExport />
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {open?.action.replace(/_/g, " ")} · {open?.table_name}
            </DialogTitle>
          </DialogHeader>
          {open ? (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">{t("common.record")}</th>
                    <th className="p-2">{t("settings.audit.before")}</th>
                    <th className="p-2">{t("settings.audit.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {diff(open.before, open.after).map((d) => (
                    <tr key={d.key} className="border-t align-top">
                      <td className="p-2 font-medium">{d.key}</td>
                      <td className="p-2 font-mono break-all text-danger">{d.before}</td>
                      <td className="p-2 font-mono break-all text-success">{d.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
