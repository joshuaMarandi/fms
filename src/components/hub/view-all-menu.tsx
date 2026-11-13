"use client";

import Link from "next/link";
import { ChevronDown, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

/** Opens every record of one kind, for all vehicles, with all their details in one table. */
export function ViewAllMenu({ items }: { items: { href: string; label: string }[] }) {
  if (items.length === 0) return null;
  if (items.length === 1) {
    return (
      <Button asChild variant="outline" className="h-10">
        <Link href={items[0]!.href}>
          <Table2 /> {t("hub.view_all_records")}
        </Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10">
          <Table2 /> {t("hub.view_all_records")} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((i) => (
          <DropdownMenuItem key={i.href} asChild>
            <Link href={i.href}>{i.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
