import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP sender. Defaults suit Gmail with an app password:
 *   SMTP_USER=you@gmail.com  SMTP_PASSWORD=<16-character app password>
 * Any other SMTP server works by setting SMTP_HOST, SMTP_PORT and SMTP_SECURE.
 */
let transporter: Transporter | null = null;

function config() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD?.replace(/\s+/g, ""); // Google shows app passwords in groups of four
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  return {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")) === "true",
    auth: { user, pass },
    from: { name: process.env.MAIL_FROM_NAME ?? "Fleet Management System", address: process.env.MAIL_FROM ?? user },
    replyTo: process.env.MAIL_REPLY_TO || undefined,
  };
}

export function emailConfigured() {
  return config() !== null;
}

export type MailMessage = { to: string | string[]; subject: string; html: string; text: string };
export type MailResult = { ok: true } | { ok: false; error: string };

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const c = config();
  if (!c) {
    return { ok: false, error: "Email is not configured. Set SMTP_USER and SMTP_PASSWORD in .env.local." };
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: c.auth, pool: true, maxConnections: 3 });
  }
  try {
    await transporter.sendMail({ from: c.from, replyTo: c.replyTo, to: message.to, subject: message.subject, html: message.html, text: message.text });
    return { ok: true };
  } catch (e) {
    const err = e as { message?: string; responseCode?: number };
    if (err.responseCode === 535) {
      return { ok: false, error: "The email server rejected the login. For Gmail, use an app password, not your normal password." };
    }
    return { ok: false, error: err.message ?? "The email could not be sent." };
  }
}
