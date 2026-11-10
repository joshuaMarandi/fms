import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DynamicIcon } from "@/components/shell/icon";
import { requireSession } from "@/lib/auth/session";
import { t } from "@/i18n";

const ITEMS = [
  { key: "settings.users", href: "/settings/users", icon: "user-cog" },
  { key: "settings.roles", href: "/settings/roles", icon: "key-round" },
  { key: "settings.company", href: "/settings/company", icon: "building-2" },
  { key: "settings.reminders", href: "/settings/reminders", icon: "bell" },
  { key: "settings.audit", href: "/settings/audit", icon: "scroll-text" },
];

export default async function SettingsPage() {
  const session = await requireSession();
  const visible = ITEMS.filter((i) => session.can(i.key, "view") && (!session.platformMode || i.key === "settings.roles" || i.key === "settings.audit"));
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((i) => (
          <Link key={i.key} href={i.href} className="page-card flex items-start gap-3 p-5 transition-colors hover:bg-muted/40">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DynamicIcon icon={i.icon} className="size-5" />
            </span>
            <span>
              <span className="block font-medium">{t(`${i.key}.title`)}</span>
              <span className="block text-sm text-muted-foreground">{t(`${i.key}.description`)}</span>
            </span>
          </Link>
        ))}
        {visible.length === 0 ? <p className="text-sm text-muted-foreground">{t("common.no_access_description")}</p> : null}
      </div>
    </>
  );
}
