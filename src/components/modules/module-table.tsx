"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable } from "@/components/patterns/data-table";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { DocButton, type DocRef } from "@/components/patterns/doc-button";
import { usePermissions } from "@/components/permissions/provider";
import { deleteRecord } from "@/lib/data/records";
import { getModule, moduleFileField } from "@/modules/registry";
import type { ColumnSpec } from "@/modules/types";
import { formatDate, formatNumber, formatTzs } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

type Row = Record<string, unknown> & { id: string };

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

const tl = (k: string) => (hasKey(k) ? t(k) : k);

export function renderCell(spec: ColumnSpec, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">{"—"}</span>;
  switch (spec.type) {
    case "number":
      return <span className="tabular-nums">{formatNumber(value as number, spec.digits ?? 0)}</span>;
    case "km":
      return <span className="tabular-nums">{formatNumber(value as number, spec.digits ?? 0)} km</span>;
    case "litres":
      return <span className="tabular-nums">{formatNumber(value as number, spec.digits ?? 1)} L</span>;
    case "hours":
      return <span className="tabular-nums">{formatNumber(value as number, spec.digits ?? 2)} h</span>;
    case "tzs":
      return <span className="tabular-nums">{formatTzs(value as number)}</span>;
    case "date":
      return formatDate(value as string);
    case "datetime":
      return formatDate(value as string, true);
    case "time":
      return String(value).slice(0, 5);
    case "status":
      return <StatusChip status={String(value)} />;
    case "reminder":
      return value === "N/A" ? <span className="text-muted-foreground">{t("common.not_applicable")}</span> : <ReminderChip date={value as string} />;
    case "reminder_date":
      return value === "N/A" ? <span className="text-muted-foreground">{t("common.not_applicable")}</span> : <ReminderChip date={value as string} showDate />;
    case "actions": {
      const list = (Array.isArray(value) ? (value as { action_required?: string; status?: string; deleted_at?: string | null }[]) : []).filter((a) => !a.deleted_at);
      if (list.length === 0) return <span className="text-muted-foreground">{"—"}</span>;
      const open = list.filter((a) => a.status === "open").length;
      return (
        <span className="flex max-w-[360px] items-center gap-2">
          <StatusChip status={open ? "open" : "closed"} tone={open ? "danger" : "success"} label={open ? t("inspections.actions_open", { count: open }) : t("inspections.actions_closed")} />
          <span className="truncate text-sm">{list.map((a) => a.action_required).filter(Boolean).join("; ")}</span>
        </span>
      );
    }
    case "discrepancy": {
      // Attained minus target km/L. Good when at or above target, or at most 2 km/L below it.
      const d = Number(value);
      const good = d >= -CONSUMPTION_TOLERANCE;
      return (
        <span className="flex items-center gap-2 tabular-nums">
          {(d > 0 ? "+" : "") + formatNumber(d, 2)}
          <StatusChip status={good ? "good" : "poor"} tone={good ? "success" : "danger"} label={good ? t("expenses.fuel.good") : t("expenses.fuel.poor")} />
        </span>
      );
    }
    case "docs":
      return <DocButton docs={Array.isArray(value) ? (value as DocRef[]) : []} compact />;
    case "multiline":
      return <span className="block min-w-[200px] max-w-[420px] whitespace-pre-line text-sm">{String(value)}</span>;
    case "bool":
      return value ? t("common.yes") : t("common.no");
    case "label": {
      const opt = spec.options?.find((o) => o.value === String(value));
      return opt ? tl(opt.label) : String(value);
    }
    case "tags": {
      const arr = Array.isArray(value) ? (value as string[]) : [String(value)];
      return (
        <span className="flex max-w-[320px] flex-wrap gap-1">
          {arr.map((v) => {
            const opt = spec.options?.find((o) => o.value === v);
            return (
              <span key={v} className="status-chip status-chip-neutral">
                {opt ? tl(opt.label) : v}
              </span>
            );
          })}
        </span>
      );
    }
    default:
      return <span className="block max-w-[360px] truncate">{String(value)}</span>;
  }
}

/** How far below the target km/L a vehicle may be and still count as Good. */
export const CONSUMPTION_TOLERANCE = 2;

export function exportValue(spec: ColumnSpec, value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (spec.type === "discrepancy") {
    const d = Number(value);
    return `${d > 0 ? "+" : ""}${formatNumber(d, 2)} (${d >= -CONSUMPTION_TOLERANCE ? t("expenses.fuel.good") : t("expenses.fuel.poor")})`;
  }
  if (spec.type === "label") return spec.options?.find((o) => o.value === String(value))?.label ? tl(spec.options.find((o) => o.value === String(value))!.label) : value;
  if (spec.type === "tags" && Array.isArray(value)) return value.map((v) => (spec.options?.find((o) => o.value === v) ? tl(spec.options.find((o) => o.value === v)!.label) : v)).join(", ");
  if (spec.type === "status") return hasKey(`status.${value}`) ? t(`status.${value}`) : value;
  if (spec.type === "date" || spec.type === "reminder_date") return formatDate(value as string);
  if (spec.type === "actions" && Array.isArray(value))
    return (value as { action_required?: string; status?: string; deleted_at?: string | null }[])
      .filter((a) => !a.deleted_at)
      .map((a) => `${a.action_required ?? ""} (${hasKey(`status.${a.status}`) ? t(`status.${a.status}`) : a.status})`)
      .join("; ");
  if (spec.type === "datetime") return formatDate(value as string, true);
  if (spec.type === "docs") return Array.isArray(value) ? (value as DocRef[]).map((d) => d.file_name).join(", ") : "";
  return value;
}

export function ModuleTable({ moduleKey, rows, pathPrefix, hiddenColumns, variant = "list", dateFilter = true }: { moduleKey: string; rows: Row[]; pathPrefix?: string; hiddenColumns?: string[]; variant?: "list" | "details"; dateFilter?: boolean }) {
  const def = getModule(moduleKey);
  const router = useRouter();
  const { can } = usePermissions();
  const [pendingDelete, setPendingDelete] = React.useState<Row | null>(null);
  const base = pathPrefix ?? def.path;
  const hiddenKey = (hiddenColumns ?? []).join(",");
  const fileField = moduleFileField(def);
  const mayAttach = can(def.resource, "edit") || can(def.resource, "create");

  const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
    () =>
      (variant === "details" && def.list.detailColumns ? def.list.detailColumns : def.list.columns).filter((spec) => !hiddenKey.split(",").includes(spec.key)).map((spec) => ({
        id: spec.key,
        header: tl(spec.header),
        accessorFn: (row) => exportValue(spec, getPath(row, spec.key)),
        cell: ({ row }) =>
          spec.type === "docs" && fileField && mayAttach ? (
            <DocButton
              docs={(getPath(row.original, spec.key) as DocRef[] | undefined) ?? []}
              compact
              upload={{ table: def.table, rowId: row.original.id, resource: def.resource, bucket: fileField.bucket ?? "forms", label: tl(fileField.label), labels: (fileField.labels ?? [fileField.label]).map((l) => tl(l)), sensitive: fileField.sensitive }}
            />
          ) : (
            renderCell(spec, getPath(row.original, spec.key))
          ),
        enableSorting: spec.sortable !== false,
        // The status filter chips hold the stored value (for example "anomalies"), not the label.
        ...(spec.key === def.list.statusColumn ? { filterFn: (row: { original: Row }, _id: string, value: unknown) => value === undefined || String(getPath(row.original, spec.key) ?? "") === value } : {}),
        enableHiding: true,
        // Date columns feed the table's From and To filter.
        meta: { hidden: spec.hidden, ...(spec.type === "date" || spec.type === "datetime" || spec.type === "reminder_date" ? { dateOf: (row: Row) => getPath(row, spec.key) } : {}) },
      })),
    [def, hiddenKey, variant, fileField, mayAttach],
  );

  const canEdit = can(def.resource, "edit");
  const canDelete = can(def.resource, "delete");

  return (
    <>
      <DataTable<Row>
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchKeys={def.list.searchKeys?.map((k) => k as keyof Row & string)}
        statusColumn={def.list.statusColumn}
        statusLabel={(s) => {
          const spec = def.list.columns.find((c) => c.key === def.list.statusColumn);
          const opt = spec?.type === "label" ? spec.options?.find((o) => o.value === s) : undefined;
          return opt ? tl(opt.label) : undefined;
        }}
        rowHref={(r) => `${base}/${r.id}`}
        dateFilter={dateFilter}
        canExport={can(def.resource, "export")}
        exportName={def.exportName}
        exportTitle={tl(def.title)}
        rowActions={[
          { label: t("common.view"), href: (r) => `${base}/${r.id}` },
          { label: t("common.edit"), href: (r) => `${base}/${r.id}`, hidden: () => !canEdit },
          { label: t("common.delete"), destructive: true, onSelect: (r) => setPendingDelete(r), hidden: () => !canDelete },
        ]}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        description={t("common.confirm_delete")}
        destructive
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const res = await deleteRecord(def.table, pendingDelete.id, [base]);
          if (!res.ok) toast.error(res.error);
          else {
            toast.success(t("common.deleted"));
            router.refresh();
          }
          setPendingDelete(null);
        }}
      />
    </>
  );
}
