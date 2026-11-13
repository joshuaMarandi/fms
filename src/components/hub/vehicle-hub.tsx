"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusChip, type ChipTone } from "@/components/patterns/status-chip";
import { VehicleStatus } from "@/components/patterns/vehicle-status";
import { DynamicIcon } from "@/components/shell/icon";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { callRpc } from "@/lib/data/records";
import { cn, formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

export type HubChip = { label: string; tone: ChipTone };

/** A cell in the list view: plain text, or a coloured chip. */
export type HubCell = string | { chip: HubChip } | null;

/**
 * A column of the list view. registration, makeModel and status are built in; any other key is
 * read from the vehicle's cells.
 */
export type HubColumn = { key: string; label: string; align?: "right" };

export type HubVehicle = {
  id: string;
  registration: string;
  makeModel: string;
  odometerKm: number | null;
  status: string;
  statusReason: string | null;
  notSafe: boolean;
  /** Main state for this hub, for example Inspected today. */
  chip: HubChip;
  /** Count badge, for example open actions. */
  badge?: { count: number; label: string; tone: ChipTone } | null;
  /** One short line, for example 1,240 km this month. */
  detail?: string | null;
  /** Values for the list view columns. */
  cells?: Record<string, HubCell>;
};

export type HubKind = {
  key: string;
  label: string;
  description: string;
  /** Icon name from the shell icon set. */
  icon: string;
  /** Records page; vehicle and month are added as query parameters. */
  path: string;
  /** Daily records: ask for the month first. */
  monthly: boolean;
  /** Table for the month counts (monthly kinds only). */
  table?: string;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const VIEW_KEY = "fms.hub.view";

/**
 * Vehicles as cards (or a compact list). Clicking a vehicle asks what to open: the kind of record
 * when there are several, then the month for daily records, and goes straight to those records.
 */
const DEFAULT_COLUMNS: HubColumn[] = [
  { key: "registration", label: "fleet.reg" },
  { key: "makeModel", label: "fleet.make_model" },
  { key: "status", label: "common.status" },
];

export function VehicleHub({ vehicles, kinds, currentYear, currentMonth, columns = DEFAULT_COLUMNS, listNote }: { vehicles: HubVehicle[]; kinds: HubKind[]; currentYear: number; currentMonth: number; columns?: HubColumn[]; listNote?: string }) {
  const router = useRouter();
  const [view, setView] = React.useState<"cards" | "list">("cards");
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<HubVehicle | null>(null);
  const [kind, setKind] = React.useState<HubKind | null>(null);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const v = window.localStorage.getItem(VIEW_KEY);
        if (v === "cards" || v === "list") setView(v);
      } catch {
        /* storage unavailable: keep cards */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const changeView = (v: "cards" | "list") => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? vehicles.filter((v) => `${v.registration} ${v.makeModel}`.toLowerCase().includes(q)) : vehicles;
    return [...list].sort((a, b) => a.registration.localeCompare(b.registration));
  }, [vehicles, query]);

  const go = (href: string) => {
    startNavigationProgress();
    router.push(href);
  };

  function open(v: HubVehicle) {
    setPicked(v);
    if (kinds.length === 1) {
      const only = kinds[0]!;
      if (!only.monthly) return go(`${only.path}?vehicle=${v.id}`);
      setKind(only);
    } else {
      setKind(null);
    }
  }

  function chooseKind(k: HubKind) {
    if (!picked) return;
    if (!k.monthly) return go(`${k.path}?vehicle=${picked.id}`);
    setKind(k);
  }

  return (
    <section aria-label={t("hub.vehicles")} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("hub.search")} aria-label={t("hub.search")} className="h-10 pl-9" />
        </div>
        <div className="flex items-center rounded-lg border bg-card p-0.5" role="group" aria-label={t("hub.view")}>
          <button type="button" onClick={() => changeView("cards")} aria-pressed={view === "cards"} aria-label={t("hub.view.cards")} className={cn("flex size-9 items-center justify-center rounded-md", view === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            <LayoutGrid className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => changeView("list")} aria-pressed={view === "list"} aria-label={t("hub.view.list")} className={cn("flex size-9 items-center justify-center rounded-md", view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            <List className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {shown.length === 0 ? <p className="page-card p-6 text-center text-sm text-muted-foreground">{t("hub.no_vehicles")}</p> : null}

      {view === "cards" ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => open(v)} className="page-card flex h-full w-full flex-col gap-3 p-4 text-left transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-2xl font-bold tracking-tight">{v.registration}</span>
                    <span className="block truncate text-sm text-muted-foreground">{v.makeModel}</span>
                  </span>
                  {v.badge && v.badge.count > 0 ? (
                    <span className={cn("status-chip shrink-0", `status-chip-${v.badge.tone}`)} title={v.badge.label}>
                      <span className="font-semibold tabular-nums">{v.badge.count}</span> {v.badge.label}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusChip status="hub" tone={v.chip.tone} label={v.chip.label} />
                  {v.status !== "in_service" || v.notSafe ? <VehicleStatus status={v.status} reason={v.statusReason} notSafe={v.notSafe} /> : null}
                </span>
                <span className="mt-auto flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                  <span className="truncate">{v.detail ?? ""}</span>
                  <span className="shrink-0 tabular-nums">{v.odometerKm !== null ? `${formatNumber(v.odometerKm)} km` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="page-card overflow-x-auto">
          {listNote ? <p className="border-b px-4 py-2 text-xs text-muted-foreground">{listNote}</p> : null}
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("px-4 py-2.5 font-medium", c.align === "right" && "text-right")}>
                    {t(c.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((v) => (
                <tr
                  key={v.id}
                  tabIndex={0}
                  role="link"
                  aria-label={`${v.registration} ${v.makeModel}`}
                  onClick={() => open(v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open(v);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none"
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.align === "right" && "text-right tabular-nums")}>
                      {c.key === "registration" ? (
                        <span className="font-semibold">{v.registration}</span>
                      ) : c.key === "makeModel" ? (
                        <span className="text-muted-foreground">{v.makeModel}</span>
                      ) : c.key === "status" ? (
                        <VehicleStatus status={v.status} reason={v.statusReason} notSafe={v.notSafe} />
                      ) : (
                        <Cell value={v.cells?.[c.key] ?? null} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">{picked?.registration}</DialogTitle>
            <DialogDescription>{kind ? t("hub.pick_month", { kind: kind.label }) : t("hub.pick_kind")}</DialogDescription>
          </DialogHeader>
          {picked && !kind ? (
            <div className="grid gap-2">
              {kinds.map((k) => (
                <button key={k.key} type="button" onClick={() => chooseKind(k)} className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <DynamicIcon icon={k.icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{k.label}</span>
                    <span className="block text-xs text-muted-foreground">{k.description}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
          {picked && kind ? (
            <MonthPicker
              key={`${picked.id}-${kind.key}`}
              vehicleId={picked.id}
              kind={kind}
              currentYear={currentYear}
              currentMonth={currentMonth}
              onBack={kinds.length > 1 ? () => setKind(null) : undefined}
              onPick={(month) => go(`${kind.path}?vehicle=${picked.id}${month ? `&month=${month}` : ""}`)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MonthPicker({ vehicleId, kind, currentYear, currentMonth, onBack, onPick }: { vehicleId: string; kind: HubKind; currentYear: number; currentMonth: number; onBack?: () => void; onPick: (month: string | null) => void }) {
  const [year, setYear] = React.useState(currentYear);
  // Month counts per year, loaded when a year is first shown.
  const [byYear, setByYear] = React.useState<Record<number, Record<number, number>>>({});
  const counts = kind.table ? (byYear[year] ?? null) : {};

  React.useEffect(() => {
    if (!kind.table || byYear[year]) return;
    let live = true;
    callRpc<{ month: number; records: number }[]>("vehicle_month_counts", { p_table: kind.table, p_vehicle: vehicleId, p_year: year }).then((res) => {
      if (!live) return;
      const m: Record<number, number> = {};
      if (res.ok) for (const r of res.data ?? []) m[r.month] = Number(r.records);
      setByYear((prev) => ({ ...prev, [year]: m }));
    });
    return () => {
      live = false;
    };
  }, [kind.table, vehicleId, year, byYear]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft /> {t("hub.back")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setYear((y) => y - 1)} aria-label={t("hub.prev_year")}>
            <ChevronLeft />
          </Button>
          <span className="w-16 text-center font-semibold tabular-nums" aria-live="polite">
            {year}
          </span>
          <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setYear((y) => y + 1)} disabled={year >= currentYear} aria-label={t("hub.next_year")}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {MONTHS.map((name, i) => {
          const m = i + 1;
          const future = year > currentYear || (year === currentYear && m > currentMonth);
          const isCurrent = year === currentYear && m === currentMonth;
          const n = counts?.[m] ?? 0;
          return (
            <button
              key={name}
              type="button"
              disabled={future}
              onClick={() => onPick(`${year}-${String(m).padStart(2, "0")}`)}
              className={cn(
                "flex min-h-[68px] flex-col items-start justify-between rounded-lg border p-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                future ? "cursor-not-allowed opacity-40" : "hover:border-primary hover:bg-primary/5",
                isCurrent && "border-primary",
                n > 0 && !future && "bg-primary/5",
              )}
            >
              <span className="text-sm font-medium">{name.slice(0, 3)}</span>
              <span className="text-xs text-muted-foreground">{counts === null ? "…" : n === 1 ? t("hub.record_one") : n > 1 ? t("hub.records", { count: n }) : future ? "" : t("hub.no_records")}</span>
            </button>
          );
        })}
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={() => onPick(null)}>
        <CalendarDays /> {t("hub.all_months")}
      </Button>
    </div>
  );
}

function Cell({ value }: { value: HubCell }) {
  if (value === null || value === "") return <span className="text-muted-foreground">—</span>;
  if (typeof value === "string") return <>{value}</>;
  return <StatusChip status="hub" tone={value.chip.tone} label={value.chip.label} />;
}

/** Summary tiles above the vehicles. */
export function HubSummary({ tiles }: { tiles: { label: string; value: string; sub?: string; tone?: ChipTone; href?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => {
        const body = (
          <>
            <span className="block text-sm text-muted-foreground">{tile.label}</span>
            <span className={cn("mt-1 block text-2xl font-bold tabular-nums", tile.tone === "danger" && "text-danger", tile.tone === "warning" && "text-warning")}>{tile.value}</span>
            {tile.sub ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{tile.sub}</span> : null}
          </>
        );
        return tile.href ? (
          <Link key={tile.label} href={tile.href} className="page-card p-4 transition-colors hover:border-primary/60">
            {body}
          </Link>
        ) : (
          <div key={tile.label} className="page-card p-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}
