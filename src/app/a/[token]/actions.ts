"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessagesSoon } from "@/lib/messaging/soon";

export type LinkDecision = { decision: "approved" | "rejected"; reason?: string; extra?: Record<string, string> };
export type LinkDecisionResult = { ok: true; next: string | null } | { ok: false; error: string };

const TOKEN = /^[0-9a-f]{32}$/;

/**
 * Decide a request from the personal link in an email or SMS, without signing in. The database
 * checks the link (unused, not expired, still the current step) and acts as the person it was sent to.
 */
export async function decideByLink(token: string, input: LinkDecision): Promise<LinkDecisionResult> {
  if (!TOKEN.test(token)) return { ok: false, error: "This link is not valid." };
  if (input.decision !== "approved" && input.decision !== "rejected") return { ok: false, error: "Choose approve or reject." };
  if (input.decision === "rejected" && !input.reason?.trim()) return { ok: false, error: "Give the reason for rejecting." };

  const extra = Object.fromEntries(Object.entries(input.extra ?? {}).filter(([k, v]) => /^[a-z_]{1,40}$/.test(k) && typeof v === "string" && v.trim() !== "").map(([k, v]) => [k, v.trim().slice(0, 200)]));
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("approval_link_decide", {
    p_token: token,
    p_decision: input.decision,
    p_reason: input.reason?.trim().slice(0, 1000) || null,
    p_extra: extra,
    p_signature: null,
  });
  if (error) {
    const hint = error.hint ?? "";
    if (hint.startsWith("link_")) return { ok: false, error: "This link can no longer be used: the request was already decided or the link expired." };
    return { ok: false, error: error.message };
  }
  await sendMessagesSoon();
  revalidatePath(`/a/${token}`);
  return { ok: true, next: ((data ?? {}) as { next?: string | null }).next ?? null };
}
