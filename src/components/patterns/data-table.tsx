"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Inbox, MoreHorizontal, Search, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusChip } from "./status-chip";
import { ANY_DATE, DateRangeFilter, dateValueRange, type DateValue } from "./date-range-filter";
import { useUrlDateValue } from "./url-date-filter";
import { useHeaderDateOptions, useHeaderDates } from "@/components/shell/header-tools";
import { useSession } from "@/components/permissions/provider";
import { exportCsv, exportExcel, exportPdf, type ExportColumn } from "@/lib/export";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type RowAction<T> = {
  label: string;
  onSelect?: (row: T) => void;
  href?: (row: T) => string;
  destructive?: boolean;
  hidden?: (row: T) => boolean;
};

export type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Keys searched by the free-text box */
  searchKeys?: (keyof T & string)[];
  /** Column id holding a status for the filter chips */
  statusColumn?: string;
  statusOptions?: string[];
  /** Chip label for a status value (defaults to the status.* wording). */
  statusLabel?: (status: string) => string | undefined;
  /** The date filter (on by default when a column holds dates); off where the page filters dates itself. */
  dateFilter?: boolean;
  rowHref?: (row: T) => string | undefined;
  /** Called on row click when there is no rowHref (for actions such as opening a workspace). */
  onRowClick?: (row: T) => void;
  rowActions?: RowAction<T>[];
  canExport?: boolean;
  exportName?: string;
  exportTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  toolbar?: React.ReactNode;
  getRowId?: (row: T) => string;
  dense?: boolean;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchKeys,
  statusColumn,
  statusOptions,
  statusLabel,
  rowHref,
  onRowClick,
  rowActions,
  canExport,
  exportName = "export",
  exportTitle,
  emptyTitle,
  emptyDescription,
  pageSize = 20,
  toolbar,
  getRowId,
  dense,
  dateFilter = true,
}: DataTableProps<T>) {
  const router = useRouter();
  const session = useSession();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [ownDate, setDateValue] = React.useState<DateValue>(ANY_DATE);

  // Date filter: the first column that says how to read its date (meta.dateOf), else the first
  // plain column whose values are dates. Every table with a date gets a From and To filter.
  const dateOf = React.useMemo<((row: T) => string | null) | null>(() => {
    for (const c of columns) {
      const fn = (c.meta as { dateOf?: (row: T) => unknown } | undefined)?.dateOf;
      if (fn) return (row: T) => {
        const v = fn(row);
        return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
      };
    }
    for (const c of columns) {
      const key = (c as { accessorKey?: string }).accessorKey;
      if (!key) continue;
      const sample = data.find((r) => r[key] !== null && r[key] !== undefined && r[key] !== "")?.[key];
      if (typeof sample === "string" && /^\d{4}-\d{2}-\d{2}/.test(sample)) {
        return (row: T) => {
          const v = row[key];
          return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
        };
      }
    }
    return null;
  }, [columns, data]);
  // The page's date picker is in the top bar; this table follows it.
  const inHeader = useHeaderDates(dateFilter && !!dateOf);
  const headerOptions = useHeaderDateOptions();
  const urlDate = useUrlDateValue(headerOptions.defaultPeriod);
  const dateValue = inHeader ? urlDate : ownDate;
  const rowsInRange = React.useMemo(() => {
    const range = dateFilter && dateOf ? dateValueRange(dateValue) : null;
    if (!range || !dateOf) return data;
    return data.filter((r) => {
      const d = dateOf(r);
      return !!d && d >= range.from && d <= range.to;
    });
  }, [data, dateOf, dateValue, dateFilter]);

  const allColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!rowActions || rowActions.length === 0) return columns;
    return [
      ...columns,
      {
        id: "_actions",
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => {
          const visible = rowActions.filter((a) => !a.hidden?.(row.original));
          if (visible.length === 0) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9" aria-label={t("table.open_menu")} onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {visible.map((a) =>
                  a.href ? (
                    <DropdownMenuItem key={a.label} asChild>
                      <Link href={a.href(row.original)}>{a.label}</Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={a.label} variant={a.destructive ? "destructive" : "default"} onSelect={() => a.onSelect?.(row.original)}>
                      {a.label}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ];
  }, [columns, rowActions]);

  const table = useReactTable({
    data: rowsInRange,
    columns: allColumns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId,
    initialState: { pagination: { pageSize } },
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "").toLowerCase();
      if (!q) return true;
      const keys = searchKeys ?? (Object.keys(row.original) as (keyof T & string)[]);
      return keys.some((k) => String(row.original[k] ?? "").toLowerCase().includes(q));
    },
  });

  const statusFilter = statusColumn ? (table.getColumn(statusColumn)?.getFilterValue() as string | undefined) : undefined;
  const statuses = statusOptions ?? (statusColumn ? Array.from(new Set(data.map((d) => String(d[statusColumn] ?? "")).filter(Boolean))) : []);

  async function doExport(kind: "csv" | "xlsx" | "pdf") {
    const visible = table.getVisibleLeafColumns().filter((c) => c.id !== "_actions");
    const cols: ExportColumn[] = visible.map((c) => {
      const header = c.columnDef.header;
      return { key: c.id, header: typeof header === "string" ? header : c.id };
    });
    const rows = table.getFilteredRowModel().rows.map((r) => Object.fromEntries(visible.map((c) => [c.id, r.getValue(c.id)])));
    if (kind === "csv") exportCsv(cols, rows, exportName);
    else {
      const ctx = { brand: session.brand, printedBy: session.fullName };
      if (kind === "xlsx") await exportExcel(cols, rows, exportName, exportTitle, ctx);
      else await exportPdf(cols, rows, exportName, exportTitle, ctx);
    }
  }

  const filtered = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();

  return (
    <div className="page-card overflow-hidden">
      <div className="flex flex-col gap-2 border-b p-3 md:flex-row md:items-center">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={t("table.search")} aria-label={t("table.search")} className="h-10 pl-9" />
        </div>
        {statusColumn && statuses.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("common.status")}>
            {statuses.map((s) => {
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => table.getColumn(statusColumn)?.setFilterValue(active ? undefined : s)}
                  className={cn("rounded-full border px-1 py-0.5 transition-colors", active ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-border")}
                >
                  <StatusChip status={s} label={statusLabel?.(s)} />
                </button>
              );
            })}
            {statusFilter ? (
              <Button variant="ghost" size="sm" onClick={() => table.getColumn(statusColumn)?.setFilterValue(undefined)}>
                <X /> {t("common.clear_filters")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {dateFilter && dateOf && !inHeader ? <DateRangeFilter value={dateValue} onChange={setDateValue} /> : null}
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10">
                <Settings2 /> <span className="hidden sm:inline">{t("common.columns")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto">
              <DropdownMenuLabel>{t("table.toggle_columns")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* The menu stays open so several columns can be hidden or shown in one go. Hidden
                  columns come back when the page is reloaded. */}
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                    {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                  </DropdownMenuCheckboxItem>
                ))}
              {table.getAllLeafColumns().some((c) => c.getCanHide() && !c.getIsVisible()) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); table.resetColumnVisibility(); }}>{t("table.show_all_columns")}</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {canExport ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10">
                  <Download /> <span className="hidden sm:inline">{t("common.export")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => doExport("csv")}>{t("common.export_csv")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => doExport("xlsx")}>{t("common.export_excel")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => doExport("pdf")}>{t("common.export_pdf")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className={dense ? "text-xs" : undefined}>
          <TableHeader className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  return (
                    <TableHead key={h.id} className="whitespace-nowrap">
                      {h.isPlaceholder ? null : canSort ? (
                        <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={h.column.getToggleSortingHandler()} aria-label={sorted === "asc" ? t("table.sort_desc") : t("table.sort_asc")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3.5" /> : sorted === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="h-48">
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Inbox className="size-5" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-medium">{emptyTitle ?? (data.length === 0 ? t("common.empty_title") : t("table.no_results"))}</p>
                    {data.length === 0 ? <p className="text-xs text-muted-foreground">{emptyDescription ?? t("common.empty_description")}</p> : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const href = rowHref?.(row.original);
                const activate = href
                  ? () => {
                      startNavigationProgress();
                      router.push(href);
                    }
                  : onRowClick
                    ? () => onRowClick(row.original)
                    : undefined;
                return (
                  <TableRow
                    key={row.id}
                    className={activate ? "cursor-pointer" : undefined}
                    onClick={activate}
                    onKeyDown={activate ? (e) => { if (e.key === "Enter") activate(); } : undefined}
                    tabIndex={activate ? 0 : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn("whitespace-nowrap", dense && "py-1.5")}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 border-t p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{t("common.results", { count: filtered })}</span>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">{t("common.rows_per_page")}</span>
          <Select value={String(table.getState().pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger className="h-9 w-[80px]" aria-label={t("common.rows_per_page")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="tabular-nums">{t("common.page_of", { page: table.getState().pagination.pageIndex + 1, pages: Math.max(1, pageCount) })}</span>
          <Button variant="outline" size="icon" className="size-9" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label={t("common.previous")}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="size-9" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label={t("common.next")}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
