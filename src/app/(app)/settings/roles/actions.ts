"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/data/records";

type GrantInput = { resource_key: string; actions: string[]; scope: string };

export async function saveRoleGrants(roleId: string, grants: GrantInput[]): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_role_grants", { p_role_id: roleId, p_grants: grants });
  if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
  revalidatePath("/settings/roles");
  return { ok: true, data: data as number };
}

export async function createRole(input: { name: string; description?: string; copy_from?: string | null }): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  if (input.copy_from) {
    const { data, error } = await supabase.rpc("copy_role", { p_source_role: input.copy_from, p_name: input.name, p_description: input.description ?? null });
    if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
    revalidatePath("/settings/roles");
    return { ok: true, data: { id: data as string } };
  }
  const { data, error } = await supabase.from("roles").insert({ name: input.name, description: input.description ?? null }).select("id").single();
  if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
  revalidatePath("/settings/roles");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function renameRole(roleId: string, name: string, description: string | null): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.from("roles").update({ name, description }).eq("id", roleId);
  if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
  revalidatePath("/settings/roles");
  return { ok: true, data: null };
}

export async function deleteRole(roleId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.from("roles").delete().eq("id", roleId);
  if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
  revalidatePath("/settings/roles");
  return { ok: true, data: null };
}

export async function rolePreview(roleId: string): Promise<ActionResult<string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("role_preview", { p_role_id: roleId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((data ?? []) as { sentence: string }[]).map((r) => r.sentence) };
}
