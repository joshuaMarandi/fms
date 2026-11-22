"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchSelect } from "@/components/patterns/search-select";
import { DateRangeFilter, type DateValue } from "@/components/patterns/date-range-filter";
import { InHeader } from "@/components/shell/header-tools";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { cn } from "@/lib/utils";
import type { PeriodKey } from "./periods";
import { t } from "@/i18n";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Vehicle, date and view of the records shown, in one bar that looks like every table's own filters.
 * The choice lives in the address, so it can be shared and survives a reload.
 */
export function RecordsFilter({
  basePath,
  vehicles,
  vehicle,
  month,
  period,
  monthly,
  yearly = false,
  year = null,
  from = null,
  to = null,
  details,
  hasDetails,
  currentYear,
  currentMonth,
  landOnMonth = false,
}: {
  /** The page lands on the current month: months come first, and "any date" is kept in the address. */
  landOnMonth?: boolean;
  basePath: string;
  vehicles: { value: string; label: string; keywords?: string[] }[];
  vehicle: string | null;
  month: string | null;
  period: PeriodKey | null;
  monthly: boolean;
  yearly?: boolean;
  year?: number | null;
  from?: string | null;
  to?: string | null;
  details: boolean;
  hasDetails: boolean;
  currentYear: number;
  currentMonth: number;
}) {
  const router = useRouter();

  const picks = React.useMemo(() => {
    if (monthly) {
      const options: { value: string; label: string }[] = [];
      for (let i = 0; i < 36; i++) {
        const idx = currentYear * 12 + (currentMonth - 1) - i;
        const y = Math.floor(idx / 12);
        const m = (idx % 12) + 1;
        options.push({ value: `m:${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS[m - 1]} ${y}` });
      }
      if (month && !options.some((o) => o.value === `m:${month}`)) {
        const [y, m] = month.split("-").map(Number);
        options.push({ value: `m:${month}`, label: `${MONTHS[(m ?? 1) - 1]} ${y}` });
      }
      return { heading: t("hub.months"), options };
    }
    if (yearly) {
      const options = Array.from({ length: Math.max(10, year ? currentYear - year + 1 : 0) }, (_, i) => currentYear - i).map((y) => ({ value: `y:${y}`, label: String(y) }));
      return { heading: t("hub.year"), options };
    }
    return undefined;
  }, [monthly, yearly, currentYear, currentMonth, month, year]);

  const value: DateValue = period
    ? { kind: "period", period }
    : month
      ? { kind: "pick", value: `m:${month}`, label: picks?.options.find((o) => o.value === `m:${month}`)?.label ?? month }
      : year
        ? { kind: "pick", value: `y:${year}`, label: String(year) }
        : from || to
          ? { kind: "range", from: from ?? "", to: to ?? "" }
          : { kind: "all" };

  const go = (next: { vehicle?: string | null; date?: DateValue; details?: boolean }) => {
    const v = next.vehicle !== undefined ? next.vehicle : vehicle;
    const date = next.date ?? value;
    const d = next.details !== undefined ? next.details : details;
    const q = new URLSearchParams();
    q.set("vehicle", v || "all");
    if (date.kind === "period") q.set("period", date.period);
    else if (date.kind === "pick" && date.value.startsWith("m:")) q.set("month", date.value.slice(2));
    else if (date.kind === "pick" && date.value.startsWith("y:")) q.set("year", date.value.slice(2));
    else if (date.kind === "range") {
      if (date.from) q.set("from", date.from);
      if (date.to) q.set("to", date.to);
    } else if (date.kind === "all" && landOnMonth) q.set("period", "all");
    if (d) q.set("details", "1");
    startNavigationProgress();
    router.push(`${basePath}?${q.toString()}`);
  };

  return (
    <div className="page-card flex flex-wrap items-center gap-2 p-3">
      <div className="min-w-[240px] flex-1 md:max-w-sm">
        <SearchSelect id="records-vehicle" value={vehicle && vehicle !== "all" ? vehicle : ""} options={vehicles} placeholder={t("hub.all_vehicles")} onChange={(v) => go({ vehicle: v || null })} />
      </div>
      <InHeader>
        <DateRangeFilter value={value} onChange={(date) => go({ date })} picks={picks} compact first={landOnMonth && monthly ? "month" : undefined} />
      </InHeader>
      {hasDetails ? (
        <div className="ml-auto flex items-center rounded-lg border bg-card p-0.5" role="group" aria-label={t("hub.view")}>
          {[false, true].map((d) => (
            <button
              key={String(d)}
              type="button"
              onClick={() => go({ details: d })}
              aria-pressed={details === d}
              className={cn("h-9 rounded-md px-3 text-sm", details === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {d ? t("hub.view.details") : t("hub.view.summary")}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
