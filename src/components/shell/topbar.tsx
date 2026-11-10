import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { NotificationsBell, type NotificationRow } from "./notifications-bell";
import { ProfileBlock } from "./profile-menu";
import { QuickAction } from "./quick-action";
import { t } from "@/i18n";

export function Topbar({ notifications, unread }: { notifications: NotificationRow[]; unread: number }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-none md:px-4">
      <SidebarTrigger className="size-10" aria-label={t("nav.toggle_sidebar")} />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        <CommandPalette />
        <QuickAction />
        <NotificationsBell initial={notifications} initialUnread={unread} />
        <ProfileBlock variant="topbar" />
      </div>
    </header>
  );
}
