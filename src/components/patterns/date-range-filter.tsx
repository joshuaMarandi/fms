"use client";

import * as React from "react";
import { CalendarRange, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIODS, periodRange, type PeriodKey } from "@/components/hub/periods";
import { cn, formatDate, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * The one date filter used on every table and records page: a single button showing the dates in
 * force; it opens quick periods, an optional list (months or years) and a custom From and To.
 */
export type DateValue =
  | { kind: "all" }
  | { kind: "period"; period: PeriodKey }
  | { kind: "pick"; value: string; label: string }
  | { kind: "range"; from: string; to: string };

export const ANY_DATE: DateValue = { kind: "all" };

/** From and to (inclusive, YYYY-MM-DD) for a value; null for any date. Picks are resolved by the caller. */
export function dateValueRange(v: DateValue, today = todayISO()): { from: string; to: string } | null {
  if (v.kind === "period") return periodRange(v.period, today);
  if (v.kind === "range") return { from: v.from || "0000-01-01", to: v.to || "9999-12-31" };
  return null;
}

export function dateValueLabel(v: DateValue) {
  if (v.kind === "all") return t("filter.any_date");
  if (v.kind === "period") return t(`hub.period.${v.period}`);
  if (v.kind === "pick") return v.label;
  if (v.from && v.to) return `${formatDate(v.from)} – ${formatDate(v.to)}`;
  return v.from ? t("filter.since", { date: formatDate(v.from) }) : t("filter.until", { date: formatDate(v.to) });
}

export function DateRangeFilter({
  value,
  onChange,
  picks,
  className,
  compact,
  allowAll = true,
}: {
  /** In the top bar: just the icon on phones, the dates on wider screens. */
  compact?: boolean;
  /** Offer "Any date" (and the clear button). */
  allowAll?: boolean;
  value: DateValue;
  onChange: (v: DateValue) => void;
  /** Extra choices such as months or years, shown under the quick periods. */
  picks?: { heading: string; options: { value: string; label: string }[] };
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(value.kind === "range" ? value.from : "");
  const [to, setTo] = React.useState(value.kind === "range" ? value.to : "");
  const active = value.kind !== "all";
  const clearable = active && allowAll;

  const choose = (v: DateValue) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className={cn("flex items-center", className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) {
            setFrom(value.kind === "range" ? value.from : "");
            setTo(value.kind === "range" ? value.to : "");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("h-10 justify-start gap-2", compact ? "max-w-[220px] px-2.5 md:px-3" : "max-w-[260px]", active && "border-primary bg-primary/5 text-primary hover:bg-primary/10", clearable && "rounded-r-none")}
            aria-label={`${t("filter.date")}: ${dateValueLabel(value)}`}
          >
            <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
            {compact ? null : <span className="text-muted-foreground">{t("filter.date")}:</span>}
            <span className={cn("truncate font-medium", compact && "hidden md:inline")}>{dateValueLabel(value)}</span>
            <ChevronDown className={cn("ml-auto size-4 shrink-0 opacity-60", compact && "hidden md:block")} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align={compact ? "end" : "start"} className="w-[min(92vw,340px)] space-y-3 p-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("filter.quick")}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {allowAll ? (
                <PresetButton on={value.kind === "all"} onClick={() => choose(ANY_DATE)}>
                  {t("filter.any_date")}
                </PresetButton>
              ) : null}
              {PERIODS.map((p) => (
                <PresetButton key={p} on={value.kind === "period" && value.period === p} onClick={() => choose({ kind: "period", period: p })}>
                  {t(`hub.period.${p}`)}
                </PresetButton>
              ))}
            </div>
          </div>
          {picks && picks.options.length ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{picks.heading}</p>
              <Select value={value.kind === "pick" ? value.value : ""} onValueChange={(v) => choose({ kind: "pick", value: v, label: picks.options.find((o) => o.value === v)?.label ?? v })}>
                <SelectTrigger className="h-9 w-full" aria-label={picks.heading}>
                  <SelectValue placeholder={t("filter.choose")} />
                </SelectTrigger>
                <SelectContent>
                  {picks.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("filter.custom")}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                {t("common.from")}
                <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9" />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t("common.to")}
                <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9" />
              </label>
            </div>
            <Button type="button" size="sm" className="mt-2 w-full" disabled={!from && !to} onClick={() => choose({ kind: "range", from, to })}>
              {t("filter.apply")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {clearable ? (
        <Button type="button" variant="outline" size="icon" className="h-10 w-9 rounded-l-none border-l-0 border-primary text-primary" onClick={() => onChange(ANY_DATE)} aria-label={t("filter.clear_date")}>
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function PresetButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-8 rounded-md border px-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        on ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60 hover:bg-primary/5",
      )}
    >
      {children}
    </button>
  );
}
