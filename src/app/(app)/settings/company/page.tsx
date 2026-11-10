import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CompanyClient } from "./company-client";
import { t } from "@/i18n";

export default async function CompanyPage() {
  const session = await requirePermission("settings.company", "view");
  const supabase = await createClient();
  const companyId = session.profile.company_id!;

  const [{ data: company }, { data: sites }, { data: prices }, { data: categories }, { data: vehicles }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
    supabase.from("sites").select("id, name, region").eq("company_id", companyId).is("deleted_at", null).order("name"),
    supabase.from("wash_prices").select("id, category, price_tzs").eq("company_id", companyId).is("deleted_at", null),
    supabase.from("leave_categories").select("id, name, counts_against_balance").eq("company_id", companyId).is("deleted_at", null).order("name"),
    supabase.from("vehicles").select("id, registration, make, model, target_km_per_l").is("deleted_at", null).order("registration"),
  ]);

  return (
    <>
      <PageHeader title={t("settings.company.title")} description={t("settings.company.description")} />
      <CompanyClient
        company={company as { id: string; name: string; logo_url: string | null; settings: Record<string, unknown> }}
        sites={(sites ?? []) as { id: string; name: string; region: string | null }[]}
        prices={(prices ?? []) as { id: string; category: string; price_tzs: number }[]}
        categories={(categories ?? []) as { id: string; name: string; counts_against_balance: boolean }[]}
        vehicles={(vehicles ?? []) as { id: string; registration: string; make: string; model: string; target_km_per_l: number | null }[]}
        canEdit={session.can("settings.company", "edit")}
      />
    </>
  );
}
