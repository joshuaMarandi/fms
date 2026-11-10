import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "../package-form";
import type { Resource } from "@/lib/permissions";
import { t } from "@/i18n";

export default async function NewPackagePage() {
  await requirePermission("platform.packages", "create");
  const supabase = await createClient();
  const { data: resources } = await supabase.from("resources").select("*").order("sort_order");
  return (
    <>
      <PageHeader title={t("platform.packages.new")} description={t("platform.packages.description")} />
      <PackageForm pkg={null} resources={(resources ?? []) as Resource[]} companiesUsing={0} />
    </>
  );
}
