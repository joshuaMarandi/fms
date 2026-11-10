import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * 2. The service-role client sends the invitation and completes the profile.
 * 3. The role is assigned with the caller's session, so the database role guards
 *    (admin ceiling, no owner or admin roles for admins) still apply.
 * If step 3 is refused the new auth user is removed again.
 */
export async function inviteUserServer(input: InviteInput): Promise<ActionResult<{ id: string }>> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();
  if (!email || !fullName || !input.role_id) return { ok: false, error: "Name, email and role are required." };

  const caller = await createClient();
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const [{ data: allowed }, { data: isOwner }, { data: profile }] = await Promise.all([
    caller.rpc("has_permission", { p_resource: "settings.users", p_action: "create" }),
    caller.rpc("is_owner"),
    caller.from("profiles").select("company_id").eq("id", user.id).single(),
  ]);
  if (!allowed && !isOwner) return { ok: false, error: "You do not have permission to invite users." };

  let companyId = (profile as { company_id: string | null } | null)?.company_id ?? null;
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

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback?next=/reset-password`;
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName, phone: input.phone ?? null, company_id: companyId },
  });
  if (inviteErr || !invited?.user) {
    const msg = inviteErr?.message ?? "The invitation could not be sent.";
    return { ok: false, error: /already/i.test(msg) ? "A user with this email already exists." : msg };
  }
  const newId = invited.user.id;

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
    await admin.auth.admin.deleteUser(newId);
    return { ok: false, error: profileErr.message };
  }

  const { error: roleErr } = await caller.from("user_roles").insert({ user_id: newId, role_id: input.role_id, is_primary: true });
  if (roleErr) {
    await admin.auth.admin.deleteUser(newId);
    return { ok: false, error: roleErr.message, hint: roleErr.hint ?? undefined };
  }

  return { ok: true, data: { id: newId } };
}
