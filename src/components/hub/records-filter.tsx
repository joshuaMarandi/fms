"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/patterns/search-select";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { t } from "@/i18n";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Change the vehicle or the month of the records shown; the choice lives in the address. */
export function RecordsFilter({
  basePath,
  vehicles,
  vehicle,
  month,
  monthly,
  currentYear,
  currentMonth,
}: {
  basePath: string;
  vehicles: { value: string; label: string; keywords?: string[] }[];
  vehicle: string | null;
  month: string | null;
  monthly: boolean;
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

  const go = (v: string | null, m: string | null) => {
    const q = new URLSearchParams();
    q.set("vehicle", v || "all");
    if (m) q.set("month", m);
    startNavigationProgress();
    router.push(`${basePath}?${q.toString()}`);
  };

  return (
    <div className="page-card flex flex-wrap items-end gap-3 p-3">
      <div className="min-w-[220px] flex-1 space-y-1.5">
        <Label htmlFor="records-vehicle">{t("inspections.vehicle")}</Label>
        <SearchSelect id="records-vehicle" value={vehicle && vehicle !== "all" ? vehicle : ""} options={vehicles} placeholder={t("hub.all_vehicles")} onChange={(v) => go(v || null, month)} />
      </div>
      {monthly ? (
        <div className="min-w-[200px] space-y-1.5">
          <Label htmlFor="records-month">{t("hub.month")}</Label>
          <Select value={month ?? "all"} onValueChange={(v) => go(vehicle, v === "all" ? null : v)}>
            <SelectTrigger id="records-month" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("hub.all_months")}</SelectItem>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
