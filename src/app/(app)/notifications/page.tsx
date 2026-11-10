import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { NotificationRow } from "@/components/shell/notifications-bell";
import { kindIcon } from "@/components/shell/notification-icon";
import { MarkAllReadButton } from "./mark-all-read";
import { t } from "@/i18n";

export default async function NotificationsPage() {
  await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, kind, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as NotificationRow[];

  return (
    <>
      <PageHeader title={t("notifications.title")} description={t("notifications.description")} actions={<MarkAllReadButton />} />
      <div className="page-card divide-y">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t("nav.no_notifications")}</p>
        ) : (
          rows.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 p-4 ${n.read_at ? "" : "bg-primary/5"}`}>
              <span className="mt-0.5">{kindIcon(n.kind)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(`notifications.kind.${n.kind}`)} · {formatDate(n.created_at, true)}
                </p>
              </div>
              {n.link ? (
                <Link href={n.link} className="text-sm text-primary underline-offset-4 hover:underline">
                  {t("common.open")}
                </Link>
              ) : null}
            </div>
          ))
        )}
      </div>
    </>
  );
}
