import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Finance gives the petty cash (or pays an outstation allowance) from the email link (no sign-in): the amount, their name and the proof
 * of payment. The file goes to storage first (only for a link still open), then the database records
 * it with the amount; if that fails the file is removed again.
 */
export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{32}$/;
const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 10 * 1024 * 1024;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return fail("This link is not valid.", 404);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("The form could not be read. Try again.");
  }
  const amount = Number(String(form.get("amount") ?? "").replace(/[, ]/g, ""));
  const givenBy = String(form.get("given_by") ?? "").trim().slice(0, 120);
  const file = form.get("proof");
  if (!Number.isFinite(amount) || amount <= 0) return fail("Enter the amount given.");
  if (givenBy.length < 3) return fail("Type your full name.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose the proof of payment (PDF or photo).");
  if (!TYPES[file.type]) return fail("The proof must be a PDF or a photo (JPG, PNG or WebP).");
  if (file.size > MAX) return fail("The file is larger than 10 MB.");

  const admin = createAdminClient();
  const { data: target } = await admin.rpc("finance_link_target", { p_token: token });
  const tgt = target as { company_id: string; record_id: string; table_name?: string } | null;
  if (!tgt) return fail("This link has expired or the money is already recorded.", 410);

  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || `proof.${TYPES[file.type]}`;
  const table = tgt.table_name === "outstation_requests" ? "outstation_requests" : "petty_cash_requests";
  const path = `${tgt.company_id}/${table}/${tgt.record_id}/${Date.now()}_${safe}`;
  const { error: upErr } = await admin.storage.from("forms").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return fail("The file could not be uploaded. Try again.", 500);

  const { error } = await admin.rpc("finance_link_give", {
    p_token: token,
    p_amount: Math.round(amount * 100) / 100,
    p_given_by: givenBy,
    p_file: { bucket: "forms", path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size },
  });
  if (error) {
    await admin.storage.from("forms").remove([path]);
    const hint = (error as { hint?: string }).hint ?? "";
    if (hint === "link_done") return fail("The money for this request is already recorded.", 409);
    if (hint === "link_expired") return fail("This link has expired. Ask for the request to be sent again.", 410);
    return fail("It could not be saved. Try again.", 500);
  }
  return NextResponse.json({ ok: true });
}
