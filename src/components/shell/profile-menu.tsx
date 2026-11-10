"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronsUpDown, Globe, KeyRound, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/permissions/provider";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/utils";
import { LOCALES, t, type Locale } from "@/i18n";

function MenuItems() {
  const session = useSession();
  const router = useRouter();

  async function setLanguage(locale: string) {
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ locale }).eq("id", session.userId);
    if (error) toast.error(error.message);
    else router.refresh();
  }

  return (
    <>
      <DropdownMenuLabel className="font-normal">
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarImage src={session.avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{initials(session.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{session.email}</p>
          </div>
        </div>
        {session.primaryRole ? (
          <Badge variant="secondary" className="mt-2">
            {session.primaryRole}
          </Badge>
        ) : null}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/profile">
          <UserRound /> {t("nav.my_profile")}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/profile?tab=password">
          <KeyRound /> {t("nav.change_password")}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/profile?tab=notifications">
          <Bell /> {t("nav.notification_settings")}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Globe /> {t("nav.language")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={session.locale} onValueChange={(v) => setLanguage(v as Locale)}>
            {LOCALES.map((l) => (
              <DropdownMenuRadioItem key={l.value} value={l.value}>
                {l.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <form action="/auth/signout" method="post">
        <DropdownMenuItem asChild>
          <button type="submit" className="w-full">
            <LogOut /> {t("nav.sign_out")}
          </button>
        </DropdownMenuItem>
      </form>
    </>
  );
}

/** Avatar plus name and role badge. Used in the sidebar footer and the top right. */
export function ProfileBlock({ variant }: { variant: "sidebar" | "topbar" }) {
  const session = useSession();

  if (variant === "topbar") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-10 gap-2 px-2" aria-label={t("nav.my_profile")}>
            <Avatar className="size-8">
              <AvatarImage src={session.avatarUrl ?? undefined} alt="" />
              <AvatarFallback>{initials(session.fullName)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-left lg:block">
              <span className="block max-w-[160px] truncate text-sm font-medium leading-tight">{session.fullName}</span>
              <span className="block text-xs text-muted-foreground">{session.primaryRole}</span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <MenuItems />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={session.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">{initials(session.fullName)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{session.fullName}</span>
                <span className="truncate text-xs opacity-80">{session.primaryRole}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            <MenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
