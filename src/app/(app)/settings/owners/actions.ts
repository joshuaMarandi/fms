"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { inviteUserServer } from "@/lib/users/invite";

type Result = { ok: true } | { ok: false; error: string };

async function ownerSession() {
  const session = await requireSession();
  if (!session.roles.some((r) => r.is_owner)) return null;
  return session;
}

async function ownerRoleId() {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("id").eq("is_owner", true).eq("is_system", true).limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Invite another system owner. They get an email (and SMS with a phone number) to set their password. */
export async function inviteOwner(input: { full_name: string; email: string; phone: string }): Promise<Result> {
  if (!(await ownerSession())) return { ok: false, error: "Only a system owner can add another owner." };
  const roleId = await ownerRoleId();
  if (!roleId) return { ok: false, error: "The Owner role is missing." };
  const res = await inviteUserServer({ email: input.email, full_name: input.full_name, phone: input.phone.trim() || null, role_id: roleId, job_title: "System owner" });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/settings/owners");
  return { ok: true };
}

/** Take the owner role away and switch the account off. The last owner can never be removed. */
export async function removeOwner(userId: string): Promise<Result> {
  const session = await ownerSession();
  if (!session) return { ok: false, error: "Only a system owner can remove an owner." };
  if (userId === session.userId) return { ok: false, error: "You cannot remove yourself. Ask another owner to do it." };
  const roleId = await ownerRoleId();
  if (!roleId) return { ok: false, error: "The Owner role is missing." };
  const supabase = await createClient();
  const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role_id", roleId);
  if (error) return { ok: false, error: error.hint === "last_owner" ? "The last owner cannot be removed." : error.message };
  await supabase.from("profiles").update({ is_active: false }).eq("id", userId);
  revalidatePath("/settings/owners");
  return { ok: true };
}
