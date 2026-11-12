import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_BY_KEY, mergeContent, type TemplateContent } from "@/lib/messaging/registry";
import { TemplateEditor } from "./template-editor";
import { t } from "@/i18n";

export default async function TemplatePage({ params }: PageProps<"/settings/templates/[key]">) {
  const { key } = await params;
  const session = await requirePermission("settings.templates", "view");
  const def = TEMPLATE_BY_KEY.get(key);
  if (!def || (!session.platformMode && def.scope !== "company")) notFound();
  const companyId = session.platformMode ? null : session.profile.company_id;

  const supabase = await createClient();
  const { data } = await supabase.from("message_templates").select("company_id, content").eq("key", key);
  const rows = (data ?? []) as { company_id: string | null; content: TemplateContent }[];
  const platform = rows.find((r) => r.company_id === null)?.content ?? null;
  const own = companyId ? (rows.find((r) => r.company_id === companyId)?.content ?? null) : platform;
  // What is sent today, and what "reset" goes back to.
  const fallback = companyId ? mergeContent(def, platform) : mergeContent(def);
  const current = mergeContent(def, platform, companyId ? own : null);

  return (
    <>
      <Link href="/settings/templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("settings.templates.title")}
      </Link>
      <PageHeader className="mt-2" title={def.name} description={def.description} />
      <TemplateEditor
        templateKey={def.key}
        initial={current}
        fallback={fallback}
        hasOwn={!!own}
        canEdit={session.can("settings.templates", "edit") || (session.platformMode && session.roles.some((r) => r.is_owner))}
        companyName={session.company?.name ?? null}
        appName={process.env.MAIL_FROM_NAME ?? "Fleet Management System"}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </>
  );
}
