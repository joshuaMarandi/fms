import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CompanyForm, type PackageOption } from "../company-form";
import { t } from "@/i18n";

export default async function NewCompanyPage() {
  await requirePermission("platform.companies", "create");
  const supabase = await createClient();
  const { data: packages } = await supabase.from("packages").select("id, name, max_vehicles, price, currency, billing_period, is_active").is("deleted_at", null).order("sort_order");
  return (
    <>
      <PageHeader title={t("platform.companies.new")} description={t("platform.companies.description")} />
      <CompanyForm company={null} packages={(packages ?? []) as PackageOption[]} />
    </>
  );
}
