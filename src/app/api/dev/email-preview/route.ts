import { NextResponse, type NextRequest } from "next/server";
import {
  invitationEmail,
  notificationDigestEmail,
  passwordResetEmail,
  registrationAlertEmail,
  registrationReceivedEmail,
  registrationRejectedEmail,
} from "@/lib/email/templates";
import { sendMail } from "@/lib/email/mailer";

/**
 * Development only. Preview every email in the browser:
 *   /api/dev/email-preview                     list of templates
 *   /api/dev/email-preview?t=invite            the HTML
 *   /api/dev/email-preview?t=invite&format=text
 *   /api/dev/email-preview?t=invite&send=you@example.com   send a real test email through SMTP
 */
export const dynamic = "force-dynamic";

const sample = (t: string, base: string) => {
  switch (t) {
    case "invite":
      return invitationEmail({ name: "Neema Kessy", email: "neema@example.com", companyName: "Demo Company", roleName: "Fleet coordinator", invitedBy: "Amani Mushi", url: `${base}/auth/callback?token_hash=sample&type=invite` });
    case "reset":
      return passwordResetEmail({ name: "Juma Hassan", url: `${base}/auth/callback?token_hash=sample&type=recovery` });
    case "registration-received":
      return registrationReceivedEmail({ name: "Daudi Ngonyani", companyName: "Ruvuma Agro Supplies", packageName: "Standard" });
    case "registration-alert":
      return registrationAlertEmail({ companyName: "Ruvuma Agro Supplies", contactName: "Daudi Ngonyani", email: "daudi@example.com", phone: "+255 700 000 301", packageName: "Standard", vehicles: 12, message: "We run 12 pickups and two trucks and need fuel and maintenance tracking.", url: `${base}/platform/registrations` });
    case "registration-rejected":
      return registrationRejectedEmail({ name: "Daudi Ngonyani", companyName: "Ruvuma Agro Supplies", reason: "We could not verify the company details. Please register again with your TIN number." });
    case "digest":
      return notificationDigestEmail({
        name: "Amani Mushi",
        companyName: "Demo Company",
        url: `${base}/notifications`,
        items: [
          { kind: "reminder", title: "Insurance expires: T 123 ABC", body: "Due on 30 Nov 2026 (20 days left)", url: `${base}/fleet`, createdAt: "" },
          { kind: "reminder", title: "Driving licence expires: Rehema Ally", body: "Due on 05 Dec 2026 (25 days left)", url: `${base}/drivers`, createdAt: "" },
          { kind: "anomaly", title: "Vehicle T 321 JKL is not safe for use", body: "Brake pedal travels to the floor before biting; fluid level low.", url: `${base}/inspections/anomalies`, createdAt: "" },
          { kind: "approval", title: "Fuel log approved", body: "Your request was approved by Amani Mushi.", url: `${base}/daily-use/fuel-log`, createdAt: "" },
          { kind: "rejection", title: "Tyres rejected", body: "Reason: tread depth is still within limits.", url: `${base}/expenses/tyres`, createdAt: "" },
        ],
      });
    default:
      return null;
  }
};

const NAMES = ["invite", "reset", "registration-received", "registration-alert", "registration-rejected", "digest"];

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const base = request.nextUrl.origin;
  const t = request.nextUrl.searchParams.get("t");
  if (!t) {
    const links = NAMES.map((n) => `<li style="margin:6px 0"><a href="?t=${n}">${n}</a> &middot; <a href="?t=${n}&format=text">text</a></li>`).join("");
    return new NextResponse(`<!doctype html><meta charset="utf-8"><body style="font-family:Arial;padding:24px"><h1>Email previews</h1><ul>${links}</ul><p>Add <code>&amp;send=you@example.com</code> to send a real test through SMTP.</p></body>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const mail = sample(t, base);
  if (!mail) return new NextResponse("Unknown template", { status: 404 });
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
