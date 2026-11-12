import { NextResponse, type NextRequest } from "next/server";
import { TEMPLATES, renderSmsTemplate, type EmailTemplateDef } from "@/lib/messaging/registry";
import { templateEmail } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/mailer";

/**
 * Development only. Preview every email in the browser with sample values:
 *   /api/dev/email-preview                              list of templates
 *   /api/dev/email-preview?t=email.invite               the HTML
 *   /api/dev/email-preview?t=email.invite&format=text
 *   /api/dev/email-preview?t=email.invite&send=you@example.com   send a real test email through SMTP
 * Admins see the same previews (with their own wording) under Settings, Email and SMS templates.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const t = request.nextUrl.searchParams.get("t");
  if (!t) {
    const links = TEMPLATES.map((d) => `<li style="margin:6px 0"><a href="?t=${d.key}">${d.key}</a> &middot; ${d.name}${d.channel === "email" ? ` &middot; <a href="?t=${d.key}&format=text">text</a>` : ""}</li>`).join("");
    return new NextResponse(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;padding:24px"><h1>Message previews</h1><ul>${links}</ul><p>Add <code>&amp;send=you@example.com</code> to send a real test email through SMTP.</p></body>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const def = TEMPLATES.find((d) => d.key === t);
  if (!def) return new NextResponse("Unknown template", { status: 404 });
  if (def.channel === "sms") {
    return new NextResponse(renderSmsTemplate(def, def.defaults, def.sample), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const mail = await templateEmail((def as EmailTemplateDef).key, def.sample);
  const to = request.nextUrl.searchParams.get("send");
  if (to) {
    const res = await sendMail({ to, ...mail });
    return NextResponse.json(res.ok ? { sent: true, to, subject: mail.subject } : { sent: false, error: res.error }, { status: res.ok ? 200 : 500 });
  }
  if (request.nextUrl.searchParams.get("format") === "text") {
    return new NextResponse(`Subject: ${mail.subject}\n\n${mail.text}`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(mail.html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
