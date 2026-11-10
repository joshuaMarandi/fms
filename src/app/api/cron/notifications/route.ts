import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, emailConfigured } from "@/lib/email/mailer";
import { notificationDigestEmail, type DigestItem } from "@/lib/email/templates";

/**
 * Daily email digest: one email per user with every notification not emailed yet
 * (reminders, approvals, rejections, anomalies). Call it from cron:
 *
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/notifications
 *
 * Add ?reminders=1 to also run the reminder check first (useful when pg_cron is not available).
 */
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) {
    return NextResponse.json({ error: "Email is not configured (SMTP_USER, SMTP_PASSWORD)." }, { status: 500 });
  }

  const admin = createAdminClient();
  const base = publicOrigin(request);

  if (request.nextUrl.searchParams.get("reminders") === "1") {
    const { error } = await admin.rpc("process_due_reminders");
    if (error) return NextResponse.json({ error: `Reminder check failed: ${error.message}` }, { status: 500 });
  }

  const { data: pending, error } = await admin
    .from("notifications")
    .select("id, user_id, kind, title, body, link, created_at")
    .is("emailed_at", null)
    .order("created_at")
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byUser = new Map<string, { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string }[]>();
  for (const n of (pending ?? []) as { id: string; user_id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string }[]) {
    byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  }

  const userIds = Array.from(byUser.keys());
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email, full_name, is_active, notification_prefs, company:companies(name)").in("id", userIds)
    : { data: [] };
  const profileById = new Map(((profiles ?? []) as unknown as { id: string; email: string | null; full_name: string; is_active: boolean; notification_prefs: { email?: boolean } | null; company: { name: string } | null }[]).map((p) => [p.id, p]));

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const [userId, list] of byUser) {
    const p = profileById.get(userId);
    const ids = list.map((n) => n.id);
    const markDone = () => admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);

    if (!p || !p.email || !p.is_active || p.notification_prefs?.email === false) {
      await markDone();
      skipped++;
      continue;
    }
    const items: DigestItem[] = list.map((n) => ({ kind: n.kind, title: n.title, body: n.body, url: n.link ? `${base}${n.link}` : null, createdAt: n.created_at }));
    const mail = notificationDigestEmail({ name: p.full_name || p.email, companyName: p.company?.name ?? null, items, url: `${base}/notifications` });
    const res = await sendMail({ to: p.email, ...mail });
    if (res.ok) {
      await markDone();
      sent++;
    } else {
      failures.push(`${p.email}: ${res.error}`);
    }
  }

  return NextResponse.json({ users: byUser.size, sent, skipped, failed: failures.length, failures: failures.slice(0, 10) });
}

export const GET = handle;
export const POST = handle;
