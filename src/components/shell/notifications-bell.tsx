"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck, CircleAlert, CircleCheck, CircleX, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/permissions/provider";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function kindIcon(kind: string) {
  switch (kind) {
    case "approval":
      return <CircleCheck className="size-4 text-success" aria-hidden="true" />;
    case "rejection":
      return <CircleX className="size-4 text-danger" aria-hidden="true" />;
    case "anomaly":
      return <CircleAlert className="size-4 text-danger" aria-hidden="true" />;
    case "reminder":
      return <Clock className="size-4 text-warning" aria-hidden="true" />;
    default:
      return <Bell className="size-4 text-muted-foreground" aria-hidden="true" />;
  }
}

export function NotificationsBell({ initial, initialUnread }: { initial: NotificationRow[]; initialUnread: number }) {
  const session = useSession();
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [unread, setUnread] = React.useState(initialUnread);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${session.userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.userId}` }, (payload) => {
        const row = payload.new as NotificationRow;
        setItems((prev) => [row, ...prev].slice(0, 10));
        setUnread((n) => n + 1);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.userId]);

  async function markAllRead() {
    const supabase = createClient();
    await supabase.rpc("mark_notifications_read", { p_ids: null });
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnread(0);
    router.refresh();
  }

  async function openItem(n: NotificationRow) {
    if (!n.read_at) {
      const supabase = createClient();
      await supabase.rpc("mark_notifications_read", { p_ids: [n.id] });
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-10" aria-label={unread > 0 ? `${t("nav.notifications")}: ${unread} ${t("notifications.unread").toLowerCase()}` : t("nav.notifications")}>
          {unread > 0 ? <BellRing className="size-5" aria-hidden="true" /> : <Bell className="size-5" aria-hidden="true" />}
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{t("nav.notifications")}</p>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck /> {t("nav.mark_all_read")}
          </Button>
        </div>
        <ScrollArea className="max-h-[380px]">
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("nav.no_notifications")}</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => openItem(n)} className={`flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-muted ${n.read_at ? "" : "bg-primary/5"}`}>
                    <span className="mt-0.5">{kindIcon(n.kind)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      {n.body ? <span className="block line-clamp-2 text-xs text-muted-foreground">{n.body}</span> : null}
                      <span className="block text-[11px] text-muted-foreground">{formatDate(n.created_at, true)}</span>
                    </span>
                    {!n.read_at ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t("notifications.unread")} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              {t("nav.view_all")}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
