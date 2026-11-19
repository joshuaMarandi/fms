"use client";

import Link from "next/link";
import { ChevronDown, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InHeader } from "@/components/shell/header-tools";
import { t } from "@/i18n";

type Item = { href: string; label: string };

/** A button that opens a short list of links (one link: a plain button). */
function LinkMenu({ items, label, icon, primary, compact }: { items: Item[]; label: string; icon: React.ReactNode; primary?: boolean; compact?: boolean }) {
  if (items.length === 0) return null;
  const variant = primary ? "default" : "outline";
  if (items.length === 1) {
    return (
      <Button asChild variant={variant} className={compact ? "h-10 px-2.5 xl:px-3" : "h-10"} title={label}>
        <Link href={items[0]!.href} aria-label={label}>
          {icon} <span className={compact ? "hidden xl:inline" : undefined}>{label}</span>
        </Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} className="h-10">
          {icon} {label} <ChevronDown />
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

/** Opens every record of one kind, for all vehicles, with all their details in one table. Sits in the top bar. */
export function ViewAllMenu({ items }: { items: Item[] }) {
  return (
    <InHeader>
      <LinkMenu items={items} label={t("hub.view_all_records")} icon={<Table2 />} compact />
    </InHeader>
  );
}

/** Add a record of one of several kinds, for example a daily, mobilization or third-party inspection. */
export function AddMenu({ items, label }: { items: Item[]; label: string }) {
  return <LinkMenu items={items} label={label} icon={<Plus />} primary />;
}
