import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountsClient, AccountsError } from "@/lib/accounts/client";

/**
 * FMS -> MDV Accounts. Each FMS company is a customer there ("company-<id>"), each FMS package a package
 * ("pkg-<id>"), and the company's package a subscription ("company-<id>") that MDV Accounts invoices
 * every period. MDV Accounts answers by webhook (src/app/api/accounts/webhook) when the company pays,
 * falls behind or is suspended.
 *
 * Off until MDV_ACCOUNTS_URL and MDV_ACCOUNTS_KEY are set. Failures are logged, never shown to the user:
 * saving again (or the next change) sends everything again, and every call is safe to repeat.
 */
export function accountsClient(): AccountsClient | null {
  const url = process.env.MDV_ACCOUNTS_URL;
  const key = process.env.MDV_ACCOUNTS_KEY;
  if (!url || !key) return null;
  return new AccountsClient({ baseUrl: url, apiKey: key });
}

export const companyRef = (id: string) => `company-${id}`;
export const packageRef = (id: string) => `pkg-${id}`;

type FmsPackage = { id: string; name: string; description: string | null; price: number; currency: string; billing_period: "monthly" | "quarterly" | "yearly"; max_vehicles: number; is_active: boolean };
type FmsCompany = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  package_id: string | null;
  status: "pending" | "trial" | "active" | "suspended" | "cancelled";
  subscription_start: string | null;
  subscription_end: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** FMS prices are for the package's own period; MDV Accounts also needs the month price. */
function packageBody(p: FmsPackage) {
  const price = Number(p.price);
  const currency = p.currency === "USD" ? "USD" : "TZS";
  const common = { name: p.name, description: p.description ?? undefined, currency, units_included: p.max_vehicles, unit_name: "vehicle", extra_unit_price_month: 0, active: p.is_active } as const;
  if (p.billing_period === "yearly") return { ...common, price_month: round2(price / 12), price_year: price };
  if (p.billing_period === "quarterly") return { ...common, price_month: round2(price / 3), price_quarter: price };
  return { ...common, price_month: price };
}

export async function syncPackage(packageId: string) {
  const client = accountsClient();
  if (!client) return;
  const { data } = await createAdminClient().from("packages").select("id, name, description, price, currency, billing_period, max_vehicles, is_active").eq("id", packageId).maybeSingle();
  if (!data) return;
  await client.upsertPackage(packageRef(packageId), packageBody(data as FmsPackage));
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Sends the company, its package and its subscription. A new package is a prorated change; a cancelled
 * company is cancelled at the end of the period it has paid for. A trial in FMS is a trial there too.
 */
export async function syncCompany(companyId: string) {
  const client = accountsClient();
  if (!client) return;
  const admin = createAdminClient();
  const { data } = await admin.from("companies").select("id, name, contact_email, contact_phone, address, city, package_id, status, subscription_start, subscription_end").eq("id", companyId).maybeSingle();
  if (!data) return;
  const c = data as FmsCompany;
  const ref = companyRef(c.id);
  await client.upsertCustomer(ref, { name: c.name, email: c.contact_email ?? undefined, phone: c.contact_phone ?? undefined, address: c.address ?? undefined, city: c.city ?? undefined });
  if (!c.package_id || c.status === "pending") return;

  const { data: pk } = await admin.from("packages").select("id, name, description, price, currency, billing_period, max_vehicles, is_active").eq("id", c.package_id).maybeSingle();
  if (!pk) return;
  const pkg = pk as FmsPackage;
  await client.upsertPackage(packageRef(pkg.id), packageBody(pkg));

  let current: Awaited<ReturnType<AccountsClient["getSubscription"]>> | null = null;
  try {
    current = await client.getSubscription(ref);
  } catch (e) {
    if (!(e instanceof AccountsError && e.status === 404)) throw e;
  }

  if (c.status === "cancelled") {
    if (current && current.status !== "cancelled" && !current.cancel_at_period_end) await client.cancelSubscription(ref, true);
    return;
  }
  if (!current) {
    const today = new Date().toISOString().slice(0, 10);
    const trialDays = c.status === "trial" && c.subscription_end ? Math.max(daysBetween(today, c.subscription_end), 0) : 0;
    await client.createSubscription({
      customer: ref,
      package: packageRef(pkg.id),
      cycle: pkg.billing_period,
      quantity: 1,
      // Never bill the past: an existing company starts after the date it has paid until (or today).
      start_date: c.status !== "trial" && c.subscription_end && c.subscription_end >= today ? new Date(Date.parse(`${c.subscription_end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : today,
      trial: trialDays > 0,
      ...(trialDays > 0 ? { trial_days: trialDays } : {}),
      external_id: ref,
    });
    return;
  }
  if (current.status === "cancelled") {
    await client.updateSubscription(ref, { action: "resume" });
  } else if (current.cancel_at_period_end) {
    await client.updateSubscription(ref, { action: "resume" });
  }
  if (current.package.external_id !== packageRef(pkg.id) || current.cycle !== pkg.billing_period) {
    await client.updateSubscription(ref, { package: packageRef(pkg.id), cycle: pkg.billing_period });
  }
}

/** Runs a sync after the answer is sent, so a slow or unreachable MDV Accounts never holds up FMS. */
export function syncSoon(what: { companyId?: string; packageId?: string }) {
  if (!accountsClient()) return;
  after(async () => {
    try {
      if (what.packageId) await syncPackage(what.packageId);
      if (what.companyId) await syncCompany(what.companyId);
    } catch (e) {
      console.error("[mdv-accounts sync]", what, (e as Error).message);
    }
  });
}
