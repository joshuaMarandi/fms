"use client";

import Link from "next/link";
import { ChevronDown, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

type Item = { href: string; label: string };

/** A button that opens a short list of links (one link: a plain button). */
function LinkMenu({ items, label, icon, primary }: { items: Item[]; label: string; icon: React.ReactNode; primary?: boolean }) {
  if (items.length === 0) return null;
  const variant = primary ? "default" : "outline";
  if (items.length === 1) {
    return (
      <Button asChild variant={variant} className="h-10">
        <Link href={items[0]!.href}>
          {icon} {label}
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

/** Opens every record of one kind, for all vehicles, with all their details in one table. */
export function ViewAllMenu({ items }: { items: Item[] }) {
  return <LinkMenu items={items} label={t("hub.view_all_records")} icon={<Table2 />} />;
}

/** Add a record of one of several kinds, for example a daily, third-party or first aid inspection. */
export function AddMenu({ items, label }: { items: Item[]; label: string }) {
  return <LinkMenu items={items} label={label} icon={<Plus />} primary />;
}
