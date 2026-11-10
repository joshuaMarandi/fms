"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, Route, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const ITEMS = [
  { href: "/dashboard", label: "nav.today", icon: Home },
  { href: "/daily-use/km-log", label: "nav.trips", icon: Route },
  { href: "/requests", label: "nav.requests", icon: ClipboardList },
  { href: "/profile", label: "nav.me", icon: UserRound },
];

/** Mobile bottom navigation for the Driver role: Today, Trips, Requests, Me. */
export function DriverBottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Driver navigation" className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-4">
        {ITEMS.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-[56px] flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span>{t(it.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
