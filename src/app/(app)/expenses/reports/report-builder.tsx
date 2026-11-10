"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DatePicker } from "@/components/patterns/date-picker";
import { SearchSelect } from "@/components/patterns/search-select";
import { DataTable } from "@/components/patterns/data-table";
import { MonthlyBarChart, MonthlyLineChart, Widget } from "@/app/(app)/dashboard/charts";
import { createClient } from "@/lib/supabase/client";
import { exportCsv, exportExcel, exportPdf } from "@/lib/export";
import { formatDate, formatNumber, humanize } from "@/lib/utils";
import { t } from "@/i18n";

export type Preset = { id: string; name: string; report_type: string; filters: Record<string, string> };
type Row = Record<string, unknown>;

const DATE_KEYS = new Set(["date", "month", "from", "to", "due_date", "date_completed", "refresher_date", "occurred_at"]);

export function ReportBuilder({ types, presets, vehicles, drivers, canExport, companyId }: { types: string[]; presets: Preset[]; vehicles: { id: string; registration: string }[]; drivers: { id: string; full_name: string }[]; canExport: boolean; companyId: string }) {
  const router = useRouter();
  const today = new Date();
  const [type, setType] = React.useState(types[0] ?? "fuel");
  const [from, setFrom] = React.useState(new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10));
  const [to, setTo] = React.useState(today.toISOString().slice(0, 10));
  const [vehicle, setVehicle] = React.useState("all");
  const [driver, setDriver] = React.useState("all");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [presetName, setPresetName] = React.useState("");

  async function run() {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("generate_report", { p_type: type, p_filters: { from, to, vehicle_id: vehicle === "all" ? null : vehicle, driver_id: driver === "all" ? null : driver } });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  }

  async function savePreset() {
    if (!presetName.trim()) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("report_presets").insert({ company_id: companyId, user_id: user!.id, name: presetName.trim(), report_type: type, filters: { from, to, vehicle_id: vehicle, driver_id: driver } });
    if (error) toast.error(error.message);
    else {
      toast.success(t("common.saved"));
      setPresetName("");
      router.refresh();
    }
  }

  function applyPreset(p: Preset) {
    setType(p.report_type);
    if (p.filters.from) setFrom(p.filters.from);
    if (p.filters.to) setTo(p.filters.to);
    setVehicle(p.filters.vehicle_id ?? "all");
    setDriver(p.filters.driver_id ?? "all");
    setRows(null);
  }

  const keys = React.useMemo(() => (rows && rows.length ? Object.keys(rows[0]!) : []), [rows]);
  const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
    () =>
      keys.map((k) => ({
        id: k,
        header: humanize(k),
        accessorFn: (r) => r[k],
        cell: ({ row }) => {
          const v = row.original[k];
          if (v === null || v === undefined) return "";
          if (DATE_KEYS.has(k) && typeof v === "string") return formatDate(v, k === "occurred_at");
          if (typeof v === "number") return <span className="tabular-nums">{formatNumber(v, k.includes("km_per_l") ? 2 : 0)}</span>;
          if (Array.isArray(v)) return v.map((x) => humanize(String(x))).join(", ");
          return String(v);
        },
      })),
    [keys],
  );

  // Chart: first date-like key as x, numeric keys as series, grouped by month.
  const chart = React.useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const dateKey = keys.find((k) => DATE_KEYS.has(k) && typeof rows[0]![k] === "string");
    const numKeys = keys.filter((k) => typeof rows.find((r) => r[k] !== null)?.[k] === "number" && !k.includes("per_l") && k !== "age" && k !== "status");
    if (!dateKey || numKeys.length === 0) return null;
    const byMonth = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const m = String(r[dateKey]).slice(0, 7);
      const acc = byMonth.get(m) ?? {};
      for (const k of numKeys) acc[k] = (acc[k] ?? 0) + Number(r[k] ?? 0);
      byMonth.set(m, acc);
    }
    const data = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, v]) => ({ label: new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), ...v }));
    return { data, series: numKeys.slice(0, 4).map((k) => ({ key: k, label: humanize(k) })), unit: numKeys.some((k) => k.includes("tzs")) ? ("tzs" as const) : ("number" as const) };
  }, [rows, keys]);

  const exportCols = keys.map((k) => ({ key: k, header: humanize(k) }));
  const name = `${type}-report-${from}-${to}`;

  return (
    <div className="space-y-6">
      <div className="page-card grid gap-4 p-4 md:grid-cols-5">
        <Field>
          <FieldLabel htmlFor="rep-type">{t("expenses.reports.type")}</FieldLabel>
          <Select value={type} onValueChange={(v) => { setType(v ?? "fuel"); setRows(null); }}>
            <SelectTrigger id="rep-type" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {t(`expenses.reports.type.${ty}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="rep-from">{t("common.from")}</FieldLabel>
          <DatePicker id="rep-from" value={from} onChange={(v) => setFrom(v ?? "")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rep-to">{t("common.to")}</FieldLabel>
          <DatePicker id="rep-to" value={to} onChange={(v) => setTo(v ?? "")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rep-vehicle">{t("common.vehicle_filter")}</FieldLabel>
          <SearchSelect id="rep-vehicle" value={vehicle === "all" ? "" : vehicle} onChange={(v) => setVehicle(v || "all")} options={vehicles.map((v) => ({ value: v.id, label: v.registration }))} placeholder={t("common.all_vehicles")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rep-driver">{t("inspections.driver_name")}</FieldLabel>
          <SearchSelect id="rep-driver" value={driver === "all" ? "" : driver} onChange={(v) => setDriver(v || "all")} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder={t("common.all")} />
        </Field>
        <div className="flex flex-wrap items-end gap-2 md:col-span-5">
          <Button onClick={run} disabled={busy} className="h-10">
            <Play /> {t("expenses.reports.run")}
          </Button>
          {canExport && rows && rows.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10">
                  <Download /> {t("common.export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => exportCsv(exportCols, rows, name)}>{t("common.export_csv")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportExcel(exportCols, rows, name)}>{t("common.export_excel")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportPdf(exportCols, rows, name, t(`expenses.reports.type.${type}`))}>{t("common.export_pdf")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={t("expenses.reports.preset_name")} aria-label={t("expenses.reports.preset_name")} className="h-10 w-48" />
            <Button variant="outline" className="h-10" onClick={savePreset} disabled={!presetName.trim()}>
              <Save /> {t("expenses.reports.save_preset")}
            </Button>
          </div>
        </div>
        {presets.length ? (
          <div className="flex flex-wrap items-center gap-2 md:col-span-5">
            <span className="text-xs text-muted-foreground">{t("expenses.reports.presets")}:</span>
            {presets.map((p) => (
              <Button key={p.id} size="sm" variant="secondary" onClick={() => applyPreset(p)}>
                {p.name}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {rows ? (
        rows.length === 0 ? (
          <p className="page-card p-6 text-center text-sm text-muted-foreground">{t("expenses.reports.no_rows")}</p>
        ) : (
          <Tabs defaultValue="table">
            <TabsList>
              <TabsTrigger value="table">{t("expenses.reports.table")} ({t("expenses.reports.rows", { count: rows.length })})</TabsTrigger>
              <TabsTrigger value="chart">{t("expenses.reports.chart")}</TabsTrigger>
            </TabsList>
            <TabsContent value="table" className="mt-4">
              <DataTable<Row> columns={columns} data={rows} exportName={name} canExport={false} pageSize={50} dense />
            </TabsContent>
            <TabsContent value="chart" className="mt-4">
              {chart ? (
                <Widget title={t(`expenses.reports.type.${type}`)} description={`${formatDate(from)} to ${formatDate(to)}`}>
                  {chart.series.length === 1 ? <MonthlyBarChart data={chart.data} series={chart.series} unit={chart.unit} /> : <MonthlyLineChart data={chart.data} series={chart.series} unit={chart.unit} />}
                </Widget>
              ) : (
                <p className="page-card p-6 text-center text-sm text-muted-foreground">{t("dashboard.no_data")}</p>
              )}
            </TabsContent>
          </Tabs>
        )
      ) : null}
    </div>
  );
}
