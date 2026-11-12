import Link from "next/link";
import { Mail, MessageSquareText, PencilLine } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATES } from "@/lib/messaging/registry";
import { emailConfigured } from "@/lib/email/mailer";
import { smsConfigured } from "@/lib/sms/kilakona";
import { t } from "@/i18n";

/** Every email and SMS the system sends, with a preview of how it looks. Company admins reword their company's; the owner keeps the defaults. */
export default async function TemplatesPage() {
  const session = await requirePermission("settings.templates", "view");
  const companyId = session.platformMode ? null : session.profile.company_id;
  const supabase = await createClient();
  const q = supabase.from("message_templates").select("key, company_id, updated_at");
  const { data } = companyId ? await q.eq("company_id", companyId) : await q.is("company_id", null);
  const changed = new Set(((data ?? []) as { key: string }[]).map((r) => r.key));
  const visible = TEMPLATES.filter((d) => session.platformMode || d.scope === "company");
  const groups = [
    { channel: "email" as const, title: t("settings.templates.email"), icon: Mail, configured: emailConfigured() },
    { channel: "sms" as const, title: t("settings.templates.sms"), icon: MessageSquareText, configured: smsConfigured() },
  ];

  return (
    <>
      <PageHeader title={t("settings.templates.title")} description={t(session.platformMode ? "settings.templates.description_owner" : "settings.templates.description")} />
      <div className="space-y-8">
        {groups.map((g) => {
          const Icon = g.icon;
          const list = visible.filter((d) => d.channel === g.channel);
          return (
            <section key={g.channel} aria-labelledby={`tpl-${g.channel}`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                <h2 id={`tpl-${g.channel}`} className="text-base font-semibold">
                  {g.title}
                </h2>
                <span className={`status-chip ${g.configured ? "status-chip-success" : "status-chip-warning"}`}>{g.configured ? t("settings.templates.sending_on") : t(`settings.templates.not_configured_${g.channel}`)}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((d) => (
                  <Link key={d.key} href={`/settings/templates/${d.key}`} className="page-card flex flex-col gap-2 p-4 transition-colors hover:bg-muted/40">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium">{d.name}</span>
                      {changed.has(d.key) ? (
                        <span className="status-chip status-chip-info shrink-0">
                          <PencilLine className="size-3" aria-hidden="true" /> {t("settings.templates.reworded")}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground">{d.description}</span>
                    <span className="mt-auto text-xs text-muted-foreground">
                      {t("settings.templates.to")}: {d.audience}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
