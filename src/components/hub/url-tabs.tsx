"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

/** Tabs whose choice is kept in the address (?tab=), so going back to the page opens the same tab. */
export function UrlTabs({ tabs, defaultTab, className, children }: { tabs: string[]; defaultTab: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("tab");
  const value = current && tabs.includes(current) ? current : defaultTab;
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        const q = new URLSearchParams(params.toString());
        if (v === defaultTab) q.delete("tab");
        else q.set("tab", v);
        router.replace(`${pathname}${q.size ? `?${q.toString()}` : ""}`, { scroll: false });
      }}
      className={className}
    >
      {children}
    </Tabs>
  );
}
