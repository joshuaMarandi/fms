"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/permissions/provider";
import { quickActionFor } from "./quick-actions";
import { t } from "@/i18n";

/** The page's main create action, in the top bar. A chosen vehicle is carried to the new record. */
export function QuickAction() {
  const pathname = usePathname();
  const params = useSearchParams();
  const can = useCan();
  const match = quickActionFor(pathname);
  if (!match || !can(match.resource, "create")) return null;
  if (pathname.endsWith("/new")) return null;
  const vehicle = params.get("vehicle");
  const href = vehicle && /^[0-9a-f-]{36}$/i.test(vehicle) && !match.href.includes("?") ? `${match.href}?vehicle=${vehicle}` : match.href;
  return (
    <Button asChild className="h-10">
      <Link href={href}>
        <Plus /> <span className="hidden sm:inline">{t(match.label)}</span>
        <span className="sm:hidden">{t("nav.quick_action")}</span>
      </Link>
    </Button>
  );
}
