"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN = /^[0-9a-f]{32}$/;

/**
 * The driver confirms and signs a request made for them, from the personal link (no sign-in).
 * Their typed name, drawn signature, the time and the device are kept as proof.
 */
export async function confirmByLink(token: string, input: { name: string; image: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!TOKEN.test(token)) return { ok: false, error: "This link is not valid." };
  const name = input.name.trim().slice(0, 120);
  if (name.length < 3) return { ok: false, error: "Type your full name." };
  const image = input.image && input.image.startsWith("data:image/png;base64,") && input.image.length < 400_000 ? input.image : null;
  if (!image) return { ok: false, error: "Draw your signature in the box." };
  const h = await headers();
  const signature = {
    name,
    image,
    method: "draw",
    ip: (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0]!.trim() || null,
    device: (h.get("user-agent") ?? "").slice(0, 200) || null,
  };
  const { error } = await createAdminClient().rpc("driver_confirmation_sign", { p_token: token, p_signature: signature });
  if (error) {
    const hint = (error as { hint?: string }).hint ?? "";
    if (hint === "link_done") return { ok: false, error: "You have already confirmed this request." };
    if (hint === "link_expired") return { ok: false, error: "This link has expired. Ask your coordinator to send the request again." };
    return { ok: false, error: "The confirmation could not be saved. Try again." };
  }
  return { ok: true };
}
