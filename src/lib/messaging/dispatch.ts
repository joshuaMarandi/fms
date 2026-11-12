import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendMail } from "@/lib/email/mailer";
import { sendSms, smsConfigured } from "@/lib/sms/kilakona";
import { templateEmail } from "@/lib/email/templates";
import { loadTemplateContent } from "./load";
import { renderSmsTemplate, templateDef, type SmsTemplateDef } from "./registry";

type OutboxRow = { id: string; company_id: string | null; channel: "email" | "sms"; recipient: string; template: string; data: Record<string, unknown>; attempts: number };

const MAX_ATTEMPTS = 5;
let running: Promise<DispatchResult> | null = null;

export type DispatchResult = { sent: number; failed: number; skipped: number; errors: string[] };

/**
 * Sends the approval emails and SMS waiting in the outbox. Runs right after a request is submitted
 * or decided (from after()), and from the cron route for anything that failed or was missed.
 * Each row is claimed first, so two servers or two calls never send the same message twice.
 */
export function dispatchOutbox(base: string, limit = 50): Promise<DispatchResult> {
  if (running) return running.then(() => dispatchOutbox(base, limit));
  running = run(base, limit).finally(() => {
    running = null;
  });
  return running;
}

async function run(base: string, limit: number): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0, errors: [] };
  const admin = createAdminClient();
  // Rows stuck in sending (a crash mid-send) are retried after ten minutes.
  await admin.from("message_outbox").update({ status: "pending" }).eq("status", "sending").lt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const { data, error } = await admin
    .from("message_outbox")
    .select("id, company_id, channel, recipient, template, data, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(limit);
  if (error) {
    result.errors.push(error.message);
    return result;
  }
  const origin = base.replace(/\/+$/, "");

  for (const row of (data ?? []) as OutboxRow[]) {
    const { data: claimed } = await admin.from("message_outbox").update({ status: "sending", attempts: row.attempts + 1 }).eq("id", row.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;

    const path = typeof row.data.path === "string" ? row.data.path : null;
    const url = path ? `${origin}${path}` : "";
    const vars = { ...row.data, url, link: url };
    const done = (patch: Record<string, unknown>) => admin.from("message_outbox").update(patch).eq("id", row.id);

    try {
      let outcome: { ok: true; ref?: string | null } | { ok: false; error: string; permanent?: boolean };
      if (row.channel === "email") {
        if (!emailConfigured()) outcome = { ok: false, error: "Email is not configured (SMTP_USER, SMTP_PASSWORD).", permanent: true };
        else {
          const mail = await templateEmail(`email.${row.template}`, vars, row.company_id);
          outcome = await sendMail({ to: row.recipient, ...mail });
        }
      } else {
        if (!smsConfigured()) outcome = { ok: false, error: "SMS is not configured (KILAKONA_API_KEY, KILAKONA_API_SECRET, KILAKONA_SENDER_ID).", permanent: true };
        else {
          const def = templateDef(`sms.${row.template}`) as SmsTemplateDef;
          const text = renderSmsTemplate(def, await loadTemplateContent(def.key, row.company_id), vars);
          outcome = await sendSms(row.recipient, text);
        }
      }

      if (outcome.ok) {
        // The personal link is not kept once the message is out.
        const { path: _path, ...rest } = row.data;
        void _path;
        await done({ status: "sent", sent_at: new Date().toISOString(), provider_ref: outcome.ref ?? null, last_error: null, data: rest });
        result.sent++;
      } else {
        const final = outcome.permanent || row.attempts + 1 >= MAX_ATTEMPTS;
        await done({ status: final ? (outcome.permanent ? "skipped" : "failed") : "pending", last_error: outcome.error });
        if (outcome.permanent) result.skipped++;
        else result.failed++;
        result.errors.push(`${row.channel} ${row.recipient}: ${outcome.error}`);
      }
    } catch (e) {
      await done({ status: row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending", last_error: (e as Error).message });
      result.failed++;
      result.errors.push(`${row.channel} ${row.recipient}: ${(e as Error).message}`);
    }
  }
  if (result.errors.length) console.error("[messages]", result.errors.slice(0, 5).join(" | "));
  return result;
}
