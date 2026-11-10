import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email/mailer";
import { invitationEmail } from "@/lib/email/templates";
import { appUrl, authLink } from "@/lib/app-url";
import type { ActionResult } from "@/lib/data/records";

export type InviteInput = {
  email: string;
  full_name: string;
  phone?: string | null;
  role_id: string;
  job_title?: string | null;
  department?: string | null;
  /** Only the system owner may invite into a company other than their own. */
  company_id?: string | null;
};

/**
 * Invite a user by email and give them a role.
 * 1. The caller's own session (RLS applies) proves they may invite and decides the company.
 * 2. The service-role client creates the user with a one-time invite token and completes the profile.
 * 3. The role is assigned with the caller's session, so the database role guards
 *    (admin ceiling, no owner or admin roles for admins) still apply.
 * 4. The app sends the invitation email through SMTP.
 * If step 3 or 4 fails the new auth user is removed again, so the invite can simply be retried.
 */
export async function inviteUserServer(input: InviteInput): Promise<ActionResult<{ id: string }>> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();
  if (!email || !fullName || !input.role_id) return { ok: false, error: "Name, email and role are required." };

  const caller = await createClient();
  const { data: claims } = await caller.auth.getClaims();
  const callerId = claims?.claims?.sub as string | undefined;
  if (!callerId) return { ok: false, error: "Not signed in." };

  const [{ data: allowed }, { data: isOwner }, { data: profile }, { data: role }] = await Promise.all([
    caller.rpc("has_permission", { p_resource: "settings.users", p_action: "create" }),
    caller.rpc("is_owner"),
    caller.from("profiles").select("company_id, full_name").eq("id", callerId).single(),
    caller.from("roles").select("name").eq("id", input.role_id).maybeSingle(),
  ]);
  if (!allowed && !isOwner) return { ok: false, error: "You do not have permission to invite users." };

  const me = profile as { company_id: string | null; full_name: string } | null;
  let companyId = me?.company_id ?? null;
  if (input.company_id && input.company_id !== companyId) {
    if (!isOwner) return { ok: false, error: "Only the system owner can invite users into another company." };
    companyId = input.company_id;
  }
  if (!companyId) return { ok: false, error: "No company to invite into." };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: fullName, phone: input.phone ?? null, company_id: companyId } },
  });
  if (linkErr || !link?.user || !link.properties?.hashed_token) {
    const msg = linkErr?.message ?? "The invitation could not be created.";
    return { ok: false, error: /already|registered|exists/i.test(msg) ? "A user with this email already exists." : msg };
  }
  const newId = link.user.id;
  const rollback = async () => {
    await admin.auth.admin.deleteUser(newId);
  };

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: newId,
    company_id: companyId,
    full_name: fullName,
    email,
    phone: input.phone ?? null,
    job_title: input.job_title ?? null,
    department: input.department ?? null,
  });
  if (profileErr) {
    await rollback();
    return { ok: false, error: profileErr.message };
  }

  const { error: roleErr } = await caller.from("user_roles").insert({ user_id: newId, role_id: input.role_id, is_primary: true });
  if (roleErr) {
    await rollback();
    return { ok: false, error: roleErr.message, hint: roleErr.hint ?? undefined };
  }

  const mail = invitationEmail({
    name: fullName,
    email,
    companyName: (company as { name: string } | null)?.name ?? "your company",
    roleName: (role as { name: string } | null)?.name ?? "User",
    invitedBy: me?.full_name || "Your administrator",
    url: authLink(await appUrl(), link.properties.hashed_token, "invite"),
  });
  const sent = await sendMail({ to: email, ...mail });
  if (!sent.ok) {
    await rollback();
    return { ok: false, error: `The invitation email could not be sent: ${sent.error}` };
  }

  return { ok: true, data: { id: newId } };
}
