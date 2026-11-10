"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/patterns/date-picker";
import { t } from "@/i18n";
import type { RangeKey } from "./range";

export function DashboardFilters({ vehicles }: { vehicles: { id: string; registration: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const range = (sp.get("range") as RangeKey) ?? "30d";
  const vehicle = sp.get("vehicle") ?? "all";

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={range} onValueChange={(v) => update({ range: v ?? "30d" })}>
        <SelectTrigger className="h-10 w-[160px]" aria-label={t("common.date_range")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">{t("common.this_month")}</SelectItem>
          <SelectItem value="30d">{t("common.last_30_days")}</SelectItem>
          <SelectItem value="quarter">{t("common.this_quarter")}</SelectItem>
          <SelectItem value="year">{t("common.this_year")}</SelectItem>
          <SelectItem value="custom">{t("common.custom")}</SelectItem>
        </SelectContent>
      </Select>
      {range === "custom" ? (
        <>
          <DatePicker value={sp.get("from")} onChange={(v) => update({ from: v })} className="w-[150px]" placeholder={t("common.from")} />
          <DatePicker value={sp.get("to")} onChange={(v) => update({ to: v })} className="w-[150px]" placeholder={t("common.to")} />
        </>
      ) : null}
      <Select value={vehicle} onValueChange={(v) => update({ vehicle: v ?? "all" })}>
        <SelectTrigger className="h-10 w-[180px]" aria-label={t("common.vehicle_filter")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("common.all_vehicles")}</SelectItem>
          {vehicles.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.registration}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
