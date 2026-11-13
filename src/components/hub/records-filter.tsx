"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/patterns/search-select";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { cn } from "@/lib/utils";
import { PERIODS, type PeriodKey } from "./periods";
import { t } from "@/i18n";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Change the vehicle, the period and the view of the records shown; the choice lives in the address. */
export function RecordsFilter({
  basePath,
  vehicles,
  vehicle,
  month,
  period,
  monthly,
  details,
  hasDetails,
  currentYear,
  currentMonth,
}: {
  basePath: string;
  vehicles: { value: string; label: string; keywords?: string[] }[];
  vehicle: string | null;
  month: string | null;
  period: PeriodKey | null;
  monthly: boolean;
  details: boolean;
  hasDetails: boolean;
  currentYear: number;
  currentMonth: number;
}) {
  const router = useRouter();
  const months = React.useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (let i = 0; i < 36; i++) {
      const idx = currentYear * 12 + (currentMonth - 1) - i;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      out.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS[m - 1]} ${y}` });
    }
    if (month && !out.some((o) => o.value === month)) {
      const [y, m] = month.split("-").map(Number);
      out.push({ value: month, label: `${MONTHS[(m ?? 1) - 1]} ${y}` });
    }
    return out;
  }, [currentYear, currentMonth, month]);

  const go = (next: { vehicle?: string | null; when?: string | null; details?: boolean }) => {
    const v = next.vehicle !== undefined ? next.vehicle : vehicle;
    const when = next.when !== undefined ? next.when : period ? `p:${period}` : month;
    const d = next.details !== undefined ? next.details : details;
    const q = new URLSearchParams();
    q.set("vehicle", v || "all");
    if (when?.startsWith("p:")) q.set("period", when.slice(2));
    else if (when) q.set("month", when);
    if (d) q.set("details", "1");
    startNavigationProgress();
    router.push(`${basePath}?${q.toString()}`);
  };

  const whenValue = period ? `p:${period}` : (month ?? "all");

  return (
    <div className="page-card flex flex-wrap items-end gap-3 p-3">
      <div className="min-w-[220px] flex-1 space-y-1.5">
        <Label htmlFor="records-vehicle">{t("inspections.vehicle")}</Label>
        <SearchSelect id="records-vehicle" value={vehicle && vehicle !== "all" ? vehicle : ""} options={vehicles} placeholder={t("hub.all_vehicles")} onChange={(v) => go({ vehicle: v || null })} />
      </div>
      {monthly ? (
        <div className="min-w-[200px] space-y-1.5">
          <Label htmlFor="records-month">{t("hub.period")}</Label>
          <Select value={whenValue} onValueChange={(v) => go({ when: v === "all" ? null : v })}>
            <SelectTrigger id="records-month" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("hub.all_time")}</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t("hub.quick_periods")}</SelectLabel>
                {PERIODS.map((p) => (
                  <SelectItem key={p} value={`p:${p}`}>
                    {t(`hub.period.${p}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t("hub.months")}</SelectLabel>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {hasDetails ? (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">{t("hub.view")}</span>
          <div className="flex items-center rounded-lg border bg-card p-0.5" role="group" aria-label={t("hub.view")}>
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
        </div>
      ) : null}
    </div>
  );
}
