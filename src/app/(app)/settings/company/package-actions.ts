"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { sendMessagesSoon } from "@/lib/messaging/soon";

type Result = { ok: true } | { ok: false; error: string };

/** The company admin asks the system owner for another package. The owner gets an email and SMS. */
export async function requestPackageChange(packageId: string, note: string): Promise<Result> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_package_change", { p_package: packageId, p_note: note.slice(0, 1000) });
  if (error) return { ok: false, error: error.message };
  await sendMessagesSoon();
  revalidatePath("/settings/company");
  return { ok: true };
}

/** Withdraw a request the owner has not decided yet. */
export async function cancelPackageChange(id: string): Promise<Result> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_package_change", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/company");
  return { ok: true };
}
