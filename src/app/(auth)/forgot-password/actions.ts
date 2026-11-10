"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email/mailer";
import { passwordResetEmail } from "@/lib/email/templates";
import { appUrl, authLink } from "@/lib/app-url";

/**
 * Sends a password reset email from the app. Always reports success to the visitor,
 * so the form never reveals whether an email address has an account.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  const address = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return { ok: true };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: address });
    if (error || !data?.properties?.hashed_token) return { ok: true };
    const { data: profile } = await admin.from("profiles").select("full_name, is_active").eq("id", data.user.id).maybeSingle();
    if (profile && (profile as { is_active: boolean }).is_active === false) return { ok: true };
    const mail = passwordResetEmail({
      name: (profile as { full_name: string } | null)?.full_name || address,
      url: authLink(await appUrl(), data.properties.hashed_token, "recovery"),
    });
    const sent = await sendMail({ to: address, ...mail });
    if (!sent.ok) console.error("[password reset] email failed:", sent.error);
  } catch (e) {
    console.error("[password reset]", (e as Error).message);
  }
  return { ok: true };
}
