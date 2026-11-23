import { verifyWebhook } from "@/lib/accounts/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhooks from MDV Accounts (signed with MDV_ACCOUNTS_WEBHOOK_SECRET):
 *   subscription.suspended            -> the company is suspended (its users see the "subscription" screen)
 *   subscription.reactivated/activated -> active again
 *   subscription.cancelled            -> cancelled
 *   invoice.paid (of the subscription) -> paid until the end of that period (plus the grace days)
 * Events from the sandbox (test keys) change nothing unless FMS itself uses a test key.
 */
export const dynamic = "force-dynamic";

type SubData = { object: "subscription"; external_id: string | null; status: string };
type InvoiceData = { object: "invoice"; period_end: string | null; subscription: { external_id: string | null; status: string } | null };

const companyId = (ref: string | null | undefined) => {
  const m = /^company-([0-9a-f-]{36})$/i.exec(ref ?? "");
  return m ? m[1] : null;
};

export async function POST(request: Request) {
  const secret = process.env.MDV_ACCOUNTS_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = await request.text();
  const event = verifyWebhook<SubData | InvoiceData | Record<string, unknown>>(raw, request.headers.get("mdv-signature"), secret);
  if (!event) return new Response("Bad signature", { status: 400 });

  const fmsLive = (process.env.MDV_ACCOUNTS_KEY ?? "").startsWith("mdv_live_");
  if (event.type === "ping" || event.livemode !== fmsLive) return Response.json({ ok: true, ignored: event.type === "ping" ? undefined : "other mode" });

  const admin = createAdminClient();
  const setStatus = async (id: string, to: "active" | "suspended" | "cancelled", from: string[]) => {
    const { error } = await admin.from("companies").update({ status: to }).eq("id", id).in("status", from).is("deleted_at", null);
    if (error) throw new Error(error.message);
  };

  try {
    if (event.type.startsWith("subscription.")) {
      const data = event.data as SubData;
      const id = companyId(data.external_id);
      if (!id) return Response.json({ ok: true, ignored: "not an FMS company" });
      if (event.type === "subscription.suspended") await setStatus(id, "suspended", ["active", "trial"]);
      else if (event.type === "subscription.reactivated" || event.type === "subscription.activated") await setStatus(id, "active", ["suspended", "trial"]);
      else if (event.type === "subscription.cancelled") await setStatus(id, "cancelled", ["active", "trial", "suspended"]);
    } else if (event.type === "invoice.paid") {
      const data = event.data as InvoiceData;
      const id = companyId(data.subscription?.external_id);
      if (id && data.period_end) {
        // Paid until the period end, plus the grace days MDV Accounts gives before it suspends, so FMS
        // never blocks a company sooner than MDV Accounts would.
        const grace = Number(process.env.MDV_ACCOUNTS_GRACE_DAYS ?? 14) || 0;
        const until = new Date(Date.parse(`${data.period_end}T00:00:00Z`) + grace * 86_400_000).toISOString().slice(0, 10);
        const { data: co } = await admin.from("companies").select("subscription_end").eq("id", id).maybeSingle();
        const end = (co as { subscription_end: string | null } | null)?.subscription_end;
        if (!end || end < until) {
          const { error } = await admin.from("companies").update({ subscription_end: until }).eq("id", id);
          if (error) throw new Error(error.message);
        }
      }
    }
  } catch (e) {
    console.error("[mdv-accounts webhook]", event.type, (e as Error).message);
    return new Response("Could not apply the event", { status: 500 }); // MDV Accounts tries again
  }
  return Response.json({ ok: true });
}
