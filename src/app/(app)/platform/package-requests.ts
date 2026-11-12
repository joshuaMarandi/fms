"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { sendMessagesSoon } from "@/lib/messaging/soon";

type Result = { ok: true } | { ok: false; error: string };

/** The owner approves (the package applies at once) or rejects a company's package change request. */
export async function decidePackageChange(id: string, approve: boolean, note: string): Promise<Result> {
  await requirePermission("platform.companies", "view");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_package_change", { p_id: id, p_approve: approve, p_note: note.slice(0, 1000) });
  if (error) return { ok: false, error: error.message };
  await sendMessagesSoon();
  revalidatePath("/platform");
  revalidatePath("/platform/companies", "layout");
  return { ok: true };
}
