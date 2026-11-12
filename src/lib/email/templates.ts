import "server-only";
import { renderEmailTemplate, templateDef, type EmailTemplateDef, type Vars } from "@/lib/messaging/registry";
import { loadTemplateContent } from "@/lib/messaging/load";

/**
 * Every email the system sends, built from the template registry with the wording an admin saved
 * (company first, then the platform default). Each returns { subject, html, text }.
 */

const appName = () => process.env.MAIL_FROM_NAME ?? "Fleet Management System";
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export async function templateEmail(key: string, vars: Vars, companyId: string | null = null) {
  const def = templateDef(key) as EmailTemplateDef;
  const content = await loadTemplateContent(key, companyId);
  return renderEmailTemplate(def, content, { app: appName(), ...vars }, { appName: appName() });
}

export function invitationEmail(o: { name: string; email: string; companyName: string; roleName: string; invitedBy: string; url: string; companyId?: string | null }) {
  return templateEmail("email.invite", { name: firstName(o.name), email: o.email, company: o.companyName, role: o.roleName, invited_by: o.invitedBy, url: o.url }, o.companyId ?? null);
}

export function passwordResetEmail(o: { name: string; url: string; companyId?: string | null }) {
  return templateEmail("email.reset", { name: firstName(o.name), url: o.url }, o.companyId ?? null);
}

export function registrationReceivedEmail(o: { name: string; companyName: string; packageName: string | null }) {
  return templateEmail("email.registration_received", { name: firstName(o.name), company: o.companyName, package: o.packageName ?? "" });
}

export function registrationAlertEmail(o: { companyName: string; contactName: string; email: string; phone: string | null; packageName: string | null; vehicles: number | null; message: string | null; url: string }) {
  return templateEmail("email.registration_alert", {
    company: o.companyName,
    contact: o.contactName,
    email: o.email,
    phone: o.phone ?? "",
    package: o.packageName ?? "",
    vehicles: o.vehicles === null ? "" : String(o.vehicles),
    message: o.message ?? "",
    url: o.url,
  });
}

export function registrationRejectedEmail(o: { name: string; companyName: string; reason: string }) {
  return templateEmail("email.registration_rejected", { name: firstName(o.name), company: o.companyName, reason: o.reason });
}

export type DigestItem = { kind: string; title: string; body: string | null; url: string | null; createdAt: string };

export async function notificationDigestEmail(o: { name: string; companyName: string | null; items: DigestItem[]; url: string; companyId?: string | null }) {
  const mail = await templateEmail("email.digest", { name: firstName(o.name), company: o.companyName ?? "", count: o.items.length, items: o.items, url: o.url }, o.companyId ?? null);
  // A single update keeps its own title as the subject, as before.
  return o.items.length === 1 ? { ...mail, subject: o.items[0]!.title } : mail;
}
