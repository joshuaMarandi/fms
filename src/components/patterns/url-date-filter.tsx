"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateRangeFilter, type DateValue } from "./date-range-filter";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { isPeriod } from "@/components/hub/periods";

/**
 * The date filter for a page's summary cards and vehicle totals. The choice lives in the address
 * (period, or from and to), so the server works out the numbers for exactly those dates. Other
 * parts of the address are kept.
 */
export function UrlDateFilter({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const period = params.get("period");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const value: DateValue = isPeriod(period) ? { kind: "period", period } : from || to ? { kind: "range", from, to } : { kind: "all" };

  function onChange(v: DateValue) {
    const q = new URLSearchParams(params.toString());
    q.delete("period");
    q.delete("from");
    q.delete("to");
    if (v.kind === "period") q.set("period", v.period);
    else if (v.kind === "range") {
      if (v.from) q.set("from", v.from);
      if (v.to) q.set("to", v.to);
    }
    startNavigationProgress();
    router.push(`${pathname}${q.size ? `?${q.toString()}` : ""}`);
  }

  return <DateRangeFilter value={value} onChange={onChange} className={className} />;
}
