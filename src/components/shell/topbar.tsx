import { Suspense } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "./breadcrumbs";
import { TopbarTitle } from "./page-title";
import { NotificationsBell, type NotificationRow } from "./notifications-bell";
import { ProfileBlock } from "./profile-menu";
import { QuickAction } from "./quick-action";
import { ThemeToggle } from "./theme-toggle";
import { HeaderToolsSlot } from "./header-tools";
import { t } from "@/i18n";

/**
 * Left: menu, then the page title with the small path above it. Right: the page's filters, its main
 * create button, theme, notifications and the account (avatar only; name and role in its menu).
 */
export function Topbar({ notifications, unread }: { notifications: NotificationRow[]; unread: number }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 md:gap-3 md:px-4">
      <div className="flex min-w-0 shrink items-center gap-2">
        <SidebarTrigger className="size-10 shrink-0" aria-label={t("nav.toggle_sidebar")} />
        <Separator orientation="vertical" className="hidden h-6 md:block" />
        <div className="flex min-w-0 flex-col justify-center leading-tight">
          <div className="hidden min-w-0 md:block">
            <Breadcrumbs />
          </div>
          <TopbarTitle />
        </div>
      </div>
      <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1.5 md:gap-2">
        <HeaderToolsSlot />
        <Suspense fallback={null}>
          <QuickAction />
        </Suspense>
        <ThemeToggle />
        <NotificationsBell initial={notifications} initialUnread={unread} />
        <ProfileBlock variant="topbar" />
      </div>
    </header>
  );
}
