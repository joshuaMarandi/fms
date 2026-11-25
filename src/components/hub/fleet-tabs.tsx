"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck, Users } from "lucide-react";
import { usePermissions } from "@/components/permissions/provider";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const TABS = [
  { href: "/fleet", resource: "fleet.details", label: "resource.fleet.tab.vehicles", icon: Truck },
  { href: "/drivers", resource: "drivers.personal", label: "resource.fleet.tab.drivers", icon: Users },
];

/** Fleet database: Vehicle fleet and Drivers, the tabs the person may open. */
export function FleetTabs() {
  const pathname = usePathname();
  const { can } = usePermissions();
  const tabs = TABS.filter((x) => can(x.resource, "view"));
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={t("resource.fleet")} className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((x) => {
        const active = pathname === x.href || pathname.startsWith(`${x.href}/`);
        return (
          <Link
            key={x.href}
            href={x.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-4 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <x.icon className="size-4" aria-hidden="true" /> {t(x.label)}
          </Link>
        );
      })}
    </nav>
  );
}
