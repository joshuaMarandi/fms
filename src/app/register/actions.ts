"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email/mailer";
import { registrationAlertEmail, registrationReceivedEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/app-url";

export type RegistrationInput = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  vehicles_count: number | null;
  package_id: string | null;
  message: string | null;
};

/**
 * Stores the registration with the visitor's own (anonymous) session, so the RLS insert-only policy applies,
 * then emails the applicant a confirmation and every owner an alert. Email failures never block the registration.
 */
export async function submitRegistration(input: RegistrationInput): Promise<{ ok: boolean; error?: string }> {
  const row = {
    company_name: input.company_name.trim().slice(0, 200),
    contact_name: input.contact_name.trim().slice(0, 200),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    city: input.city?.trim() || null,
    country: input.country?.trim() || null,
    vehicles_count: input.vehicles_count,
    package_id: input.package_id || null,
    message: input.message?.trim().slice(0, 2000) || null,
  };
  const supabase = await createClient();
  const { error } = await supabase.from("company_registrations").insert(row);
  if (error) return { ok: false, error: error.message };

  try {
    const { data: pkg } = row.package_id ? await supabase.from("packages").select("name").eq("id", row.package_id).maybeSingle() : { data: null };
    const packageName = (pkg as { name: string } | null)?.name ?? null;

    const applicant = registrationReceivedEmail({ name: row.contact_name, companyName: row.company_name, packageName });
    const tasks: Promise<unknown>[] = [sendMail({ to: row.email, ...applicant })];

    const admin = createAdminClient();
    const { data: owners } = await admin.from("user_roles").select("profiles!inner(email, is_active), roles!inner(is_owner)").eq("roles.is_owner", true);
    const ownerEmails = Array.from(
      new Set(((owners ?? []) as unknown as { profiles: { email: string | null; is_active: boolean } }[]).filter((o) => o.profiles?.is_active && o.profiles.email).map((o) => o.profiles.email!)),
    );
    if (ownerEmails.length) {
      const alert = registrationAlertEmail({
        companyName: row.company_name,
        contactName: row.contact_name,
        email: row.email,
        phone: row.phone,
        packageName,
        vehicles: row.vehicles_count,
        message: row.message,
        url: `${await appUrl()}/platform/registrations`,
      });
      tasks.push(sendMail({ to: ownerEmails, ...alert }));
    }
    const results = await Promise.all(tasks);
    for (const r of results as { ok: boolean; error?: string }[]) if (!r.ok) console.error("[registration email]", r.error);
  } catch (e) {
    console.error("[registration email]", (e as Error).message);
  }
  return { ok: true };
}
