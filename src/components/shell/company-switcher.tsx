"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/i18n";

export function CompanySwitcher({ companies, current }: { companies: { id: string; name: string }[]; current: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const active = companies.find((c) => c.id === current);

  async function switchTo(id: string) {
    if (id === current) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("switch_company", { p_company: id });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="sm" className="text-sidebar-foreground/90" disabled={busy} aria-label={t("nav.switch_company")}>
          <Building2 />
          <span className="truncate">{active?.name ?? t("nav.company")}</span>
          <ChevronsUpDown className="ml-auto size-3.5" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("nav.switch_company")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => switchTo(c.id)}>
            <span className="flex-1 truncate">{c.name}</span>
            {c.id === current ? <Check className="size-4" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
