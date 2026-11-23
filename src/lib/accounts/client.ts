// Copied from mdv-accounts/packages/accounts-client/src/index.ts (keep the two the same).
import "server-only";
/**
 * MDV Accounts client for the MDV apps (server side only: the key must never reach a browser).
 *
 *   const accounts = new AccountsClient({ baseUrl: process.env.MDV_ACCOUNTS_URL!, apiKey: process.env.MDV_ACCOUNTS_KEY! });
 *   await accounts.upsertCustomer("company-17", { name: "Kilimo Transport", email: "billing@kilimo.co.tz" });
 *   await accounts.createSubscription({ customer: "company-17", package: "fleet-basic", quantity: 7, external_id: "sub-17" });
 *
 * Every write sends an Idempotency-Key (made from the call unless you give one) and is retried on network
 * errors, 409 in progress, 429 and 5xx, so a call can be repeated safely. No dependencies (Node 18+).
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type Money = string;
export type Customer = { object: "customer"; id: string; external_id: string | null; name: string; email: string | null; phone: string | null; currency: string; language: "en" | "sw" };
export type Package = { object: "package"; id: string; external_id: string | null; name: string; currency: string; price_month: Money; price_quarter: Money | null; price_year: Money | null; units_included: number; extra_unit_price_month: Money; trial_days: number; active: boolean };
export type Cycle = "monthly" | "quarterly" | "yearly";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";
export type Subscription = {
  object: "subscription";
  id: string;
  external_id: string | null;
  status: SubscriptionStatus;
  cycle: Cycle;
  quantity: number;
  next_billing_date: string;
  trial_ends_on: string | null;
  cancel_at_period_end: boolean;
  package: { id: string; external_id: string | null; name: string };
  customer: { id: string; external_id: string | null; name: string };
  invoices?: Invoice[];
};
export type Invoice = { object: "invoice"; id: string; number: string | null; status: string; currency: string; total: Money; paid: Money; balance: Money; issue_date: string; due_date: string | null; external_id: string | null; public_path: string | null; period_start: string | null; period_end: string | null };
export type Document = Omit<Invoice, "object"> & { object: "invoice" | "quotation"; subtotal: Money; vat: Money; valid_until: string | null; lines: Line[] };
export type Line = { description: string; quantity: number | string; unit?: string; unit_price: number | string; discount_pct?: number | string; vat_rate?: number | string };
export type Payment = { object: "payment"; id: string; external_id: string | null; status: "pending" | "confirmed" | "rejected"; amount: Money; currency: string; receipt_number: string | null; unallocated: Money };
export type Balance = { object: "balance"; customer_id: string; currency: "TZS"; outstanding: Money; overdue: Money; credit: Money; open_invoices: number; last_payment: string | null };

export type CustomerInput = { name: string; kind?: "company" | "person"; email?: string; phone?: string; tin?: string; vrn?: string; address?: string; city?: string; currency?: "TZS" | "USD"; terms_days?: number; language?: "en" | "sw" };
export type PackageInput = { name: string; code?: string; description?: string; currency?: "TZS" | "USD"; price_month: number; price_quarter?: number | null; price_year?: number | null; units_included?: number; unit_name?: string; extra_unit_price_month?: number; vat_rate?: number; trial_days?: number; active?: boolean };
export type SubscriptionInput = { customer: string; package: string; quantity?: number; cycle?: Cycle; start_date?: string; trial?: boolean; trial_days?: number; billing_emails?: string[]; billing_phones?: string[]; external_id?: string };
export type SubscriptionChange = { package?: string; quantity?: number; cycle?: Cycle; prorate?: boolean; billing_emails?: string[]; billing_phones?: string[] } | { action: "cancel"; at_period_end?: boolean } | { action: "resume" };
export type SaleInput = { customer: string | (CustomerInput & { external_id: string }); lines: Line[]; invoice?: "draft" | "send" | "paid"; payment?: { method?: string; reference?: string; external_id?: string; payment_date?: string }; external_id?: string; reference?: string; subject?: string; notes?: string; due_date?: string; currency?: "TZS" | "USD" };
export type DocumentInput = { customer: string; lines: Line[]; send?: boolean; external_id?: string; reference?: string; subject?: string; notes?: string; due_date?: string; valid_until?: string; currency?: "TZS" | "USD"; prices_include_vat?: boolean };
export type PaymentInput = { customer: string; amount: number; currency?: "TZS" | "USD"; method?: "bank" | "mpesa" | "tigopesa" | "airtel" | "halopesa" | "cash" | "cheque" | "card" | "other"; reference?: string; invoice_id?: string; payment_date?: string; external_id?: string; notes?: string };

export class AccountsError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "AccountsError";
  }
}

type Options = { baseUrl: string; apiKey: string; timeoutMs?: number; retries?: number; fetch?: typeof fetch };

export class AccountsClient {
  private base: string;
  private key: string;
  private timeoutMs: number;
  private retries: number;
  private fetcher: typeof fetch;

  constructor(o: Options) {
    if (!/^mdv_(live|test)_/.test(o.apiKey)) throw new Error("MDV Accounts: the API key should start with mdv_live_ or mdv_test_");
    this.base = `${o.baseUrl.replace(/\/+$/, "")}/api/v1`;
    this.key = o.apiKey;
    this.timeoutMs = o.timeoutMs ?? 15_000;
    this.retries = o.retries ?? 3;
    this.fetcher = o.fetch ?? fetch;
  }

  get livemode() {
    return this.key.startsWith("mdv_live_");
  }

  private async request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.key}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["Idempotency-Key"] = idempotencyKey ?? randomUUID();
    let last: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** (attempt - 1), 8000)));
      try {
        const res = await this.fetcher(`${this.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
        if (res.ok) return (res.headers.get("content-type")?.includes("application/json") ? await res.json() : await res.arrayBuffer()) as T;
        const err = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
        last = new AccountsError(res.status, err?.error?.code ?? "http_error", err?.error?.message ?? `HTTP ${res.status}`);
        if (!(res.status === 409 || res.status === 429 || res.status >= 500)) throw last;
      } catch (e) {
        if (e instanceof AccountsError && !(e.status === 409 || e.status === 429 || e.status >= 500)) throw e;
        last = e;
      }
    }
    throw last instanceof Error ? last : new AccountsError(0, "network_error", "MDV Accounts could not be reached");
  }

  private enc = (s: string) => encodeURIComponent(s);

  ping() {
    return this.request<{ ok: true; app: string; name: string; mode: "live" | "test"; livemode: boolean }>("GET", "/ping");
  }
  upsertCustomer(externalId: string, c: CustomerInput, idempotencyKey?: string) {
    return this.request<Customer>("PUT", `/customers/${this.enc(externalId)}`, c, idempotencyKey);
  }
  customerBalance(ref: string) {
    return this.request<Balance>("GET", `/customers/${this.enc(ref)}/balance`);
  }
  upsertPackage(externalId: string, p: PackageInput, idempotencyKey?: string) {
    return this.request<Package>("PUT", `/packages/${this.enc(externalId)}`, p, idempotencyKey);
  }
  createSubscription(s: SubscriptionInput, idempotencyKey?: string) {
    return this.request<Subscription>("POST", "/subscriptions", s, idempotencyKey ?? (s.external_id ? `subscription-${s.external_id}` : undefined));
  }
  getSubscription(ref: string) {
    return this.request<Subscription & { invoices: Invoice[] }>("GET", `/subscriptions/${this.enc(ref)}`);
  }
  updateSubscription(ref: string, change: SubscriptionChange, idempotencyKey?: string) {
    return this.request<Subscription>("PATCH", `/subscriptions/${this.enc(ref)}`, change, idempotencyKey);
  }
  cancelSubscription(ref: string, atPeriodEnd = true) {
    return this.updateSubscription(ref, { action: "cancel", at_period_end: atPeriodEnd });
  }
  recordSale(s: SaleInput, idempotencyKey?: string) {
    return this.request<Document>("POST", "/sales", s, idempotencyKey ?? (s.external_id ? `sale-${s.external_id}` : undefined));
  }
  createInvoice(d: DocumentInput, idempotencyKey?: string) {
    return this.request<Document>("POST", "/invoices", d, idempotencyKey ?? (d.external_id ? `invoice-${d.external_id}` : undefined));
  }
  createQuotation(d: DocumentInput, idempotencyKey?: string) {
    return this.request<Document>("POST", "/quotations", d, idempotencyKey ?? (d.external_id ? `quotation-${d.external_id}` : undefined));
  }
  getDocument(id: string) {
    return this.request<Document>("GET", `/documents/${this.enc(id)}`);
  }
  documentPdf(id: string) {
    return this.request<ArrayBuffer>("GET", `/documents/${this.enc(id)}/pdf`);
  }
  reportPayment(p: PaymentInput, idempotencyKey?: string) {
    return this.request<Payment>("POST", "/payments", p, idempotencyKey ?? (p.external_id ? `payment-${p.external_id}` : undefined));
  }
  summary(from?: string, to?: string) {
    const q = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
    return this.request<Record<string, string | number>>("GET", `/summary${q ? `?${q}` : ""}`);
  }
}

export type WebhookEvent<T = Record<string, unknown>> = { id: string; type: string; created_at: string; livemode: boolean; data: T };

/**
 * Checks a webhook from MDV Accounts: the MDV-Signature header against the raw body and the app's
 * webhook secret, and refuses one older than `toleranceSeconds`. Returns the event, or null.
 */
export function verifyWebhook<T = Record<string, unknown>>(rawBody: string, signatureHeader: string | null, secret: string, toleranceSeconds = 300): WebhookEvent<T> | null {
  if (!signatureHeader || !secret) return null;
  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return null;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1 ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(rawBody) as WebhookEvent<T>;
  } catch {
    return null;
  }
}
