"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_BY_KEY, renderSmsTemplate, validateContent, type TemplateContent, type EmailTemplateDef, type SmsTemplateDef } from "@/lib/messaging/registry";
import { clearTemplateCache, loadTemplateContent } from "@/lib/messaging/load";
import { templateEmail } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/mailer";
import { sendSms } from "@/lib/sms/kilakona";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function context(key: string) {
  const def = TEMPLATE_BY_KEY.get(key);
  if (!def) return { error: "Unknown template." } as const;
  const session = await requireSession();
  if (!session.can("settings.templates", "view")) return { error: "You do not have permission to see templates." } as const;
  const companyId = session.platformMode ? null : session.profile.company_id;
  if (!companyId && !session.roles.some((r) => r.is_owner)) return { error: "No company." } as const;
  if (companyId && def.scope !== "company") return { error: "Only the system owner can change this template." } as const;
  return { def, session, companyId } as const;
}

function clean(def: EmailTemplateDef | SmsTemplateDef, content: TemplateContent): TemplateContent {
  const out: TemplateContent = {};
  for (const k of Object.keys(def.defaults)) {
    const v = (content as Record<string, unknown>)[k];
    if (typeof v === "string") (out as Record<string, string>)[k] = v.slice(0, k === "paragraphs" ? 4000 : 1000);
  }
  return out;
}

/** Save the wording. The database allows it only for the company admin (or the owner for the defaults). */
export async function saveTemplate(key: string, content: TemplateContent): Promise<Result> {
  const c = await context(key);
  if ("error" in c) return { ok: false, error: c.error! };
  const value = clean(c.def, content);
  const errors = validateContent(c.def, { ...c.def.defaults, ...value });
  const first = Object.values(errors)[0];
  if (first) return { ok: false, error: first };

  const supabase = await createClient();
  const existing = supabase.from("message_templates").select("id").eq("key", key);
  const { data: row } = await (c.companyId ? existing.eq("company_id", c.companyId) : existing.is("company_id", null)).maybeSingle();
  const { error } = row
    ? await supabase.from("message_templates").update({ content: value }).eq("id", (row as { id: string }).id)
    : await supabase.from("message_templates").insert({ company_id: c.companyId, key, content: value });
  if (error) return { ok: false, error: error.code === "42501" ? "You do not have permission to change templates." : error.message };
  clearTemplateCache();
  revalidatePath("/settings/templates");
  revalidatePath(`/settings/templates/${key}`);
  return { ok: true };
}

/** Back to the default wording (the platform default for a company). */
export async function resetTemplate(key: string): Promise<Result> {
  const c = await context(key);
  if ("error" in c) return { ok: false, error: c.error! };
  const supabase = await createClient();
  const q = supabase.from("message_templates").delete().eq("key", key);
  const { error } = await (c.companyId ? q.eq("company_id", c.companyId) : q.is("company_id", null));
  if (error) return { ok: false, error: error.message };
  clearTemplateCache();
  revalidatePath("/settings/templates");
  revalidatePath(`/settings/templates/${key}`);
  return { ok: true };
}

/** Send the saved wording with sample values to your own email address or phone. */
export async function sendTestTemplate(key: string): Promise<Result> {
  const c = await context(key);
  if ("error" in c) return { ok: false, error: c.error! };
  const { profile } = c.session;
  const vars = { ...c.def.sample, company: c.session.company?.name ?? c.def.sample.company };
  if (c.def.channel === "email") {
    if (!profile.email) return { ok: false, error: "Your profile has no email address." };
    const mail = await templateEmail(key, vars, c.companyId);
    const res = await sendMail({ to: profile.email, ...mail, subject: `[Test] ${mail.subject}` });
    return res.ok ? { ok: true, message: `Test email sent to ${profile.email}.` } : { ok: false, error: res.error };
  }
  const phone = profile.phone;
  if (!phone) return { ok: false, error: "Your profile has no phone number." };
  const text = renderSmsTemplate(c.def as SmsTemplateDef, await loadTemplateContent(key, c.companyId), vars);
  const res = await sendSms(phone, text);
  return res.ok ? { ok: true, message: `Test SMS sent to ${phone}.` } : { ok: false, error: res.error };
}
