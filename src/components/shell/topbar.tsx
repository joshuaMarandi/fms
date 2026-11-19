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

export function Topbar({ notifications, unread }: { notifications: NotificationRow[]; unread: number }) {
  return (
    <header className="sticky top-0 z-20 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-none md:px-4">
      {/* Left: menu and breadcrumbs (wide screens). Middle: the page title, explained on hover. Right: actions. */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <SidebarTrigger className="size-10 shrink-0" aria-label={t("nav.toggle_sidebar")} />
        <Separator orientation="vertical" className="mr-1 hidden h-5 md:block" />
        <div className="hidden min-w-0 lg:block">
          <Breadcrumbs />
        </div>
      </div>
      <div className="flex min-w-0 max-w-[46vw] justify-center md:max-w-[40vw]">
        <TopbarTitle />
      </div>
      <div className="flex items-center justify-end gap-1 md:gap-2">
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
