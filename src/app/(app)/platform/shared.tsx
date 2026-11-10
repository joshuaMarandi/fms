import { StatusChip, type ChipTone } from "@/components/patterns/status-chip";
import { formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

export type CompanyStatus = "pending" | "trial" | "active" | "suspended" | "cancelled";

const TONES: Record<CompanyStatus, ChipTone> = { pending: "warning", trial: "info", active: "success", suspended: "danger", cancelled: "neutral" };

export function CompanyStatusChip({ status }: { status: CompanyStatus }) {
  return <StatusChip status={status} tone={TONES[status] ?? "neutral"} label={t(`platform.status.${status}`)} />;
}

export const COMPANY_STATUSES: CompanyStatus[] = ["active", "trial", "pending", "suspended", "cancelled"];
export const CURRENCIES = ["TZS", "USD", "KES", "UGX"];

/** Price normalised to one month, for recurring revenue. */
export function monthlyPrice(price: number, period: string) {
  if (period === "yearly") return price / 12;
  if (period === "quarterly") return price / 3;
  return price;
}

export function formatPrice(price: number | null | undefined, currency: string | null | undefined) {
  if (price === null || price === undefined) return "";
  return `${currency ?? "TZS"} ${formatNumber(price, 0)}`;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${formatNumber(bytes / 1024 ** 3, 1)} GB`;
  if (bytes >= 1024 ** 2) return `${formatNumber(bytes / 1024 ** 2, 1)} MB`;
  if (bytes >= 1024) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${bytes} B`;
}

export type CompanyRow = {
  id: string;
  name: string;
  status: CompanyStatus;
  package_id: string | null;
  package_name: string | null;
  max_vehicles: number | null;
  price: number | null;
  currency: string | null;
  billing_period: string | null;
  contact_name: string | null;
  contact_email: string | null;
  city: string | null;
  subscription_end: string | null;
  created_at: string;
  vehicles: number;
  users: number;
  drivers: number;
  storage_bytes: number;
  last_activity: string | null;
};

type Supa = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

/** Companies joined with their package and usage (owner only). */
export async function loadCompanyRows(supabase: Supa): Promise<CompanyRow[]> {
  const [{ data: companies }, { data: stats }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, status, package_id, contact_name, contact_email, city, subscription_end, created_at, package:packages(name, max_vehicles, price, currency, billing_period)")
      .is("deleted_at", null)
      .order("name"),
    supabase.rpc("platform_company_stats"),
  ]);
  const byId = new Map(((stats ?? []) as { company_id: string; vehicles: number; users: number; drivers: number; storage_bytes: number; last_activity: string | null }[]).map((s) => [s.company_id, s]));
  return ((companies ?? []) as Record<string, unknown>[]).map((c) => {
    const pkg = c.package as { name: string; max_vehicles: number; price: number; currency: string; billing_period: string } | null;
    const s = byId.get(c.id as string);
    return {
      id: c.id as string,
      name: c.name as string,
      status: c.status as CompanyStatus,
      package_id: (c.package_id as string) ?? null,
      package_name: pkg?.name ?? null,
      max_vehicles: pkg?.max_vehicles ?? null,
      price: pkg?.price ?? null,
      currency: pkg?.currency ?? null,
      billing_period: pkg?.billing_period ?? null,
      contact_name: (c.contact_name as string) ?? null,
      contact_email: (c.contact_email as string) ?? null,
      city: (c.city as string) ?? null,
      subscription_end: (c.subscription_end as string) ?? null,
      created_at: c.created_at as string,
      vehicles: Number(s?.vehicles ?? 0),
      users: Number(s?.users ?? 0),
      drivers: Number(s?.drivers ?? 0),
      storage_bytes: Number(s?.storage_bytes ?? 0),
      last_activity: s?.last_activity ?? null,
    };
  });
}
