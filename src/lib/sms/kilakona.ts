import "server-only";

/**
 * SMS through Kilakona (messaging.kilakona.co.tz). Set in .env.local on the server:
 *   KILAKONA_API_KEY=...        KILAKONA_API_SECRET=...      (from the Kilakona portal)
 *   KILAKONA_SENDER_ID=...      the approved sender name shown on the phone
 * Optional: KILAKONA_BASE_URL (default https://messaging.kilakona.co.tz).
 */

function config() {
  const key = process.env.KILAKONA_API_KEY?.trim();
  const secret = process.env.KILAKONA_API_SECRET?.trim();
  const sender = process.env.KILAKONA_SENDER_ID?.trim();
  if (!key || !secret || !sender) return null;
  return { key, secret, sender, base: (process.env.KILAKONA_BASE_URL?.trim() || "https://messaging.kilakona.co.tz").replace(/\/+$/, "") };
}

export function smsConfigured() {
  return config() !== null;
}

/** Tanzanian numbers in the 255XXXXXXXXX form Kilakona expects: 0712..., +255 712..., 712... */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("0")) d = `255${d.slice(1)}`;
  else if (d.length === 9 && /^[67]/.test(d)) d = `255${d}`;
  return /^\d{11,15}$/.test(d) ? d : null;
}

export type SmsResult = { ok: true; ref: string | null } | { ok: false; error: string; permanent?: boolean };

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const c = config();
  if (!c) return { ok: false, error: "SMS is not configured. Set KILAKONA_API_KEY, KILAKONA_API_SECRET and KILAKONA_SENDER_ID.", permanent: true };
  const phone = normalizePhone(to);
  if (!phone) return { ok: false, error: `Not a valid phone number: ${to}`, permanent: true };
  try {
    const res = await fetch(`${c.base}/api/v1/vendor/message/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_key: c.key, api_secret: c.secret },
      body: JSON.stringify({ senderId: c.sender, messageType: "text", message, contacts: phone }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string; data?: { validContacts?: number; shootId?: string } } | null;
    if (!res.ok || !body?.success) {
      return { ok: false, error: body?.message || `Kilakona answered ${res.status}`, permanent: res.status === 400 || res.status === 401 || res.status === 403 };
    }
    if (body.data && body.data.validContacts === 0) return { ok: false, error: `Kilakona did not accept the number ${phone}`, permanent: true };
    return { ok: true, ref: body.data?.shootId ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "The SMS could not be sent." };
  }
}

/** Remaining SMS credit, for the templates page. */
export async function smsBalance(): Promise<{ ok: true; balance: unknown } | { ok: false; error: string }> {
  const c = config();
  if (!c) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`${c.base}/api/v1/vendor/message/balance`, { headers: { api_key: c.key, api_secret: c.secret }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown; message?: string } | null;
    if (!res.ok || !body?.success) return { ok: false, error: body?.message || `Kilakona answered ${res.status}` };
    return { ok: true, balance: body.data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
