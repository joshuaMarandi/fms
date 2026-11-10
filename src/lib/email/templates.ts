import "server-only";
import { renderEmail, type Tone } from "./layout";

/** Every email the system sends. Each returns { subject, html, text }. */

const appName = () => process.env.MAIL_FROM_NAME ?? "Fleet Management System";
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function invitationEmail(o: { name: string; email: string; companyName: string; roleName: string; invitedBy: string; url: string }) {
  const { html, text } = renderEmail({
    preheader: `${o.invitedBy} invited you to ${o.companyName} on ${appName()}.`,
    heading: `You are invited to ${o.companyName}`,
    greeting: `Hello ${firstName(o.name)},`,
    paragraphs: [
      `${o.invitedBy} has created an account for you in ${appName()}, the system ${o.companyName} uses for its vehicles, drivers, inspections, requests and records.`,
      "Set your password to sign in. It takes less than a minute.",
    ],
    details: [
      { label: "Company", value: o.companyName },
      { label: "Your role", value: o.roleName },
      { label: "Sign-in email", value: o.email },
    ],
    button: { label: "Set your password", url: o.url },
    note: "For your security this link works once and expires in 24 hours. If you were not expecting this email you can ignore it.",
    company: o.companyName,
  });
  return { subject: `Your ${o.companyName} account on ${appName()}`, html, text };
}

export function passwordResetEmail(o: { name: string; url: string }) {
  const { html, text } = renderEmail({
    preheader: "Use this link to choose a new password.",
    heading: "Reset your password",
    greeting: `Hello ${firstName(o.name)},`,
    paragraphs: ["We received a request to reset the password for your account. Choose a new password with the button below."],
    button: { label: "Choose a new password", url: o.url },
    note: "This link works once and expires in 1 hour. If you did not ask for a reset, ignore this email: your password stays the same.",
  });
  return { subject: `Reset your ${appName()} password`, html, text };
}

export function registrationReceivedEmail(o: { name: string; companyName: string; packageName: string | null }) {
  const { html, text } = renderEmail({
    preheader: `We received the registration for ${o.companyName}.`,
    heading: "Registration received",
    greeting: `Hello ${firstName(o.name)},`,
    paragraphs: [
      `Thank you for registering ${o.companyName}. We review every registration and will reply soon.`,
      "Once it is approved you receive a separate email with a link to set up your administrator account.",
    ],
    details: [
      { label: "Company", value: o.companyName },
      ...(o.packageName ? [{ label: "Package requested", value: o.packageName }] : []),
    ],
  });
  return { subject: `We received your registration for ${o.companyName}`, html, text };
}

export function registrationAlertEmail(o: { companyName: string; contactName: string; email: string; phone: string | null; packageName: string | null; vehicles: number | null; message: string | null; url: string }) {
  const { html, text } = renderEmail({
    preheader: `${o.companyName} registered and is waiting for review.`,
    heading: "New company registration",
    paragraphs: [`${o.companyName} registered from the website and is waiting for your review.`, ...(o.message ? [`Message: ${o.message}`] : [])],
    details: [
      { label: "Company", value: o.companyName },
      { label: "Contact", value: o.contactName },
      { label: "Email", value: o.email },
      ...(o.phone ? [{ label: "Phone", value: o.phone }] : []),
      ...(o.packageName ? [{ label: "Package", value: o.packageName }] : []),
      ...(o.vehicles !== null ? [{ label: "Vehicles", value: String(o.vehicles) }] : []),
    ],
    button: { label: "Review registration", url: o.url },
  });
  return { subject: `New registration: ${o.companyName}`, html, text };
}

export function registrationRejectedEmail(o: { name: string; companyName: string; reason: string }) {
  const { html, text } = renderEmail({
    preheader: `Update on the registration for ${o.companyName}.`,
    heading: "Registration not approved",
    greeting: `Hello ${firstName(o.name)},`,
    paragraphs: [`Thank you for your interest. We could not approve the registration for ${o.companyName} at this time.`, `Reason: ${o.reason}`, "You are welcome to reply to this email if you have questions or want to register again."],
  });
  return { subject: `Your registration for ${o.companyName}`, html, text };
}

export type DigestItem = { kind: string; title: string; body: string | null; url: string | null; createdAt: string };

const KIND: Record<string, { label: string; tone: Tone }> = {
  reminder: { label: "Reminder", tone: "warning" },
  approval: { label: "Approved", tone: "success" },
  rejection: { label: "Rejected", tone: "danger" },
  anomaly: { label: "Anomaly", tone: "danger" },
  system: { label: "Update", tone: "neutral" },
};

export function notificationDigestEmail(o: { name: string; companyName: string | null; items: DigestItem[]; url: string }) {
  const count = o.items.length;
  const reminders = o.items.filter((i) => i.kind === "reminder").length;
  const { html, text } = renderEmail({
    preheader: `${count} update${count === 1 ? "" : "s"} in ${appName()}${reminders ? `, ${reminders} reminder${reminders === 1 ? "" : "s"}` : ""}.`,
    heading: count === 1 ? "You have 1 new update" : `You have ${count} new updates`,
    greeting: `Hello ${firstName(o.name)},`,
    paragraphs: ["Here is what needs your attention."],
    itemsHeading: "Updates",
    items: o.items.slice(0, 25).map((i) => ({
      title: i.title,
      meta: i.body ?? undefined,
      status: KIND[i.kind] ?? KIND.system,
      url: i.url ?? undefined,
    })),
    button: { label: "Open notifications", url: o.url },
    note: count > 25 ? `Showing 25 of ${count}. Open the app to see the rest.` : "You can turn these emails off under My profile, Notification settings.",
    company: o.companyName ?? undefined,
  });
  return { subject: count === 1 ? o.items[0]!.title : `${count} updates in ${appName()}`, html, text };
}
