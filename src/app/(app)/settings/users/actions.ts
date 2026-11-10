"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/data/records";

export async function inviteUser(input: { email: string; full_name: string; phone?: string; role_id: string; job_title?: string; department?: string }): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "Not signed in" };

  // The Edge Function holds the service key; it checks has_permission(settings.users, create) for the caller.
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: { ...input, redirect_to: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback?next=/reset-password` },
  });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = (await ctx.json()) as { error?: string };
        if (body?.error) message = body.error;
      }
    } catch {
      // keep the generic message
    }
    return { ok: false, error: message };
  }
  revalidatePath("/settings/users");
  return { ok: true, data: { id: (data as { id: string })?.id } };
}

export async function setUserRoles(userId: string, primaryRoleId: string, extraRoleIds: string[]): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: existing, error: e1 } = await supabase.from("user_roles").select("role_id, is_primary").eq("user_id", userId);
  if (e1) return { ok: false, error: e1.message };
  const wanted = new Set([primaryRoleId, ...extraRoleIds]);
  const have = new Set((existing ?? []).map((r: { role_id: string }) => r.role_id));

  // Clear the old primary flag first so the unique index is not violated.
  const oldPrimary = (existing ?? []).find((r: { is_primary: boolean }) => r.is_primary) as { role_id: string } | undefined;
  if (oldPrimary && oldPrimary.role_id !== primaryRoleId) {
    const { error } = await supabase.from("user_roles").update({ is_primary: false }).eq("user_id", userId).eq("role_id", oldPrimary.role_id);
    if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
  }
  for (const roleId of have) {
    if (!wanted.has(roleId)) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role_id", roleId);
      if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
    }
  }
  for (const roleId of wanted) {
    const isPrimary = roleId === primaryRoleId;
    if (have.has(roleId)) {
      const { error } = await supabase.from("user_roles").update({ is_primary: isPrimary }).eq("user_id", userId).eq("role_id", roleId);
      if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId, is_primary: isPrimary });
      if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
    }
  }
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}

export async function updateUserProfile(userId: string, values: { job_title?: string | null; department?: string | null; driver_id?: string | null; phone?: string | null }): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(values).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}

export async function setAdminCeiling(userId: string, resourceKeys: string[]): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: existing, error: e1 } = await supabase.from("admin_ceilings").select("resource_key").eq("user_id", userId);
  if (e1) return { ok: false, error: e1.message };
  const have = new Set((existing ?? []).map((r: { resource_key: string }) => r.resource_key));
  const want = new Set(resourceKeys);
  for (const k of have) {
    if (!want.has(k)) {
      const { error } = await supabase.from("admin_ceilings").delete().eq("user_id", userId).eq("resource_key", k);
      if (error) return { ok: false, error: error.message };
    }
  }
  for (const k of want) {
    if (!have.has(k)) {
      const { error } = await supabase.from("admin_ceilings").insert({ user_id: userId, resource_key: k });
      if (error) return { ok: false, error: error.message };
    }
  }
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}
