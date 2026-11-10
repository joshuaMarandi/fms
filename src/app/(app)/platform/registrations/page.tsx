import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RegistrationsClient, type Registration } from "./registrations-client";
import type { PackageOption } from "../companies/company-form";
import { t } from "@/i18n";

export default async function RegistrationsPage() {
  await requirePermission("platform.registrations", "view");
  const supabase = await createClient();
  const [{ data: regs }, { data: packages }] = await Promise.all([
    supabase.from("company_registrations").select("*, package:packages(name)").order("status").order("created_at", { ascending: false }).limit(500),
    supabase.from("packages").select("id, name, max_vehicles, price, currency, billing_period, is_active").is("deleted_at", null).order("sort_order"),
  ]);
  const rows: Registration[] = ((regs ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    company_name: r.company_name as string,
    contact_name: r.contact_name as string,
    email: r.email as string,
    phone: (r.phone as string) ?? null,
    city: (r.city as string) ?? null,
    country: (r.country as string) ?? null,
    vehicles_count: (r.vehicles_count as number) ?? null,
    package_id: (r.package_id as string) ?? null,
    package_name: (r.package as { name?: string } | null)?.name ?? null,
    message: (r.message as string) ?? null,
    status: r.status as Registration["status"],
    rejection_reason: (r.rejection_reason as string) ?? null,
    company_id: (r.company_id as string) ?? null,
    created_at: r.created_at as string,
  }));
  return (
    <>
      <PageHeader title={t("platform.registrations.title")} description={t("platform.registrations.description")} />
      <RegistrationsClient rows={rows} packages={(packages ?? []) as PackageOption[]} />
    </>
  );
}
