"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchSelect } from "@/components/patterns/search-select";
import { HeaderDates } from "@/components/shell/header-tools";
import { InHeader } from "@/components/shell/header-tools";
import { t } from "@/i18n";

/** The dashboard's dates come from the top bar's picker (last 30 days by default); the vehicle stays here. */
export function DashboardFilters({
  vehicles,
}: {
  vehicles: { id: string; registration: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
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
    <>
      <HeaderDates defaultPeriod="last_30_days" allowAll={false} />
      <InHeader>
        <div className="w-[140px] md:w-[180px]">
          <SearchSelect
            value={vehicle === "all" ? "" : vehicle}
            onChange={(v) => update({ vehicle: v || "all" })}
            options={vehicles.map((v) => ({
              value: v.id,
              label: v.registration,
            }))}
            placeholder={t("common.all_vehicles")}
          />
        </div>
      </InHeader>
    </>
  );
}
