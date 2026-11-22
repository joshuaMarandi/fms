"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateRangeFilter, type DateValue } from "./date-range-filter";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { isPeriod, monthRange, type PeriodKey } from "@/components/hub/periods";
import { todayISO } from "@/lib/utils";

/** The dates in the address: a quick period, or from and to; else the page's default (or all time). */
export function useUrlDateValue(defaultPeriod?: PeriodKey, defaultMonth?: boolean): DateValue {
  const params = useSearchParams();
  const period = params.get("period");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (isPeriod(period)) return { kind: "period", period };
  if (from || to) return { kind: "range", from, to };
  if (period === "all") return { kind: "all" };
  if (defaultMonth) {
    const r = monthRange(todayISO().slice(0, 7));
    return { kind: "range", from: r.from, to: r.to };
  }
  return defaultPeriod ? { kind: "period", period: defaultPeriod } : { kind: "all" };
}

/**
 * The date filter for a page's summary cards, totals and tables. The choice lives in the address
 * (period, or from and to), so the server works out the numbers for exactly those dates. Other
 * parts of the address are kept.
 */
export function UrlDateFilter({
  className,
  inHeader,
  defaultPeriod,
  allowAll = true,
  first,
  defaultMonth,
}: {
  className?: string;
  inHeader?: boolean;
  defaultPeriod?: PeriodKey;
  allowAll?: boolean;
  first?: "day" | "month";
  defaultMonth?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = useUrlDateValue(defaultPeriod, defaultMonth);

  function onChange(v: DateValue) {
    const q = new URLSearchParams(params.toString());
    q.delete("period");
    q.delete("from");
    q.delete("to");
    if (v.kind === "period") q.set("period", v.period);
    else if (v.kind === "range") {
      if (v.from) q.set("from", v.from);
      if (v.to) q.set("to", v.to);
    } else if (defaultPeriod || defaultMonth) q.set("period", "all");
    startNavigationProgress();
    router.push(`${pathname}${q.size ? `?${q.toString()}` : ""}`);
  }

  return <DateRangeFilter value={value} onChange={onChange} className={className} compact={inHeader} allowAll={allowAll} first={first} />;
}
