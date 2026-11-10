import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { RecordTitle } from "@/components/modules/record-title";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "../package-form";
import type { PackageInput } from "../../actions";
import type { Resource } from "@/lib/permissions";
import { t } from "@/i18n";

export default async function EditPackagePage({ params }: PageProps<"/platform/packages/[id]">) {
  const { id } = await params;
  await requirePermission("platform.packages", "edit");
  const supabase = await createClient();
  const [{ data: pkg }, { data: keys }, { data: resources }, { count }] = await Promise.all([
    supabase.from("packages").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("package_resources").select("resource_key").eq("package_id", id),
    supabase.from("resources").select("*").order("sort_order"),
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("package_id", id).is("deleted_at", null),
  ]);
  if (!pkg) notFound();
  const p = pkg as Record<string, unknown>;
  const input: PackageInput = {
    id,
    name: p.name as string,
    description: (p.description as string) ?? "",
    price: Number(p.price),
    currency: p.currency as string,
    billing_period: p.billing_period as PackageInput["billing_period"],
    max_vehicles: p.max_vehicles as number,
    is_active: p.is_active as boolean,
    is_public: p.is_public as boolean,
    sort_order: p.sort_order as number,
    resource_keys: ((keys ?? []) as { resource_key: string }[]).map((k) => k.resource_key),
  };
  return (
    <>
      <RecordTitle title={input.name} />
      <PageHeader title={t("platform.packages.edit")} description={`${input.name} · ${t("platform.packages.companies_using", { count: count ?? 0 })}`} />
      <PackageForm pkg={input} resources={(resources ?? []) as Resource[]} companiesUsing={count ?? 0} />
    </>
  );
}
