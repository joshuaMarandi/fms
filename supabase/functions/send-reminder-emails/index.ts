// Edge Function: email unsent notifications. Called by pg_cron after process_due_reminders(),
// or on a schedule. Uses the service role key (never shipped to the browser) and Resend for delivery.
import { createClient } from "jsr:@supabase/supabase-js@2";

type Notification = { id: string; user_id: string; title: string; body: string | null; link: string | null; kind: string };

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REMINDER_FROM_EMAIL") ?? "fleet@example.com";
  const appUrl = Deno.env.get("APP_URL") ?? "";
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: pending, error } = await admin
    .from("notifications")
    .select("id, user_id, title, body, link, kind")
    .is("emailed_at", null)
    .in("kind", ["reminder", "approval", "rejection", "anomaly"])
    .order("created_at")
    .limit(200);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const rows = (pending ?? []) as Notification[];
  const byUser = new Map<string, Notification[]>();
  for (const n of rows) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);

  let sent = 0;
  for (const [userId, list] of byUser) {
    const { data: profile } = await admin.from("profiles").select("email, full_name, notification_prefs").eq("id", userId).single();
    const prefs = (profile?.notification_prefs ?? {}) as { email?: boolean };
    if (!profile?.email || prefs.email === false) {
      await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", list.map((n) => n.id));
      continue;
    }
    const lines = list.map((n) => `- ${n.title}${n.body ? `: ${n.body}` : ""}${n.link ? ` (${appUrl}${n.link})` : ""}`).join("\n");
    const text = `Hello ${profile.full_name},\n\nYou have ${list.length} new notification(s) in MDV FMS:\n\n${lines}\n\nOpen the app: ${appUrl}/notifications\n`;

    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [profile.email], subject: `MDV FMS: ${list.length} notification(s)`, text }),
      });
      if (!res.ok) continue;
    } else {
      console.log(`[dry run] would email ${profile.email}:\n${text}`);
    }
    await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", list.map((n) => n.id));
    sent += list.length;
  }
  return new Response(JSON.stringify({ sent, users: byUser.size }), { headers: { "Content-Type": "application/json" } });
});
