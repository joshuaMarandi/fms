import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AnomaliesTable, type AnomalyRow } from "./anomalies-table";
import { t } from "@/i18n";

export default async function AnomaliesPage({ searchParams }: PageProps<"/inspections/anomalies">) {
  const sp = await searchParams;
  const vehicle = typeof sp.vehicle === "string" ? sp.vehicle : null;
  const session = await requirePermission("inspections", "view");
  const supabase = await createClient();

  let q = supabase.from("inspection_anomalies").select("*, vehicle:vehicles(registration), driver:drivers(full_name)").is("deleted_at", null).order("status").order("date_opened", { ascending: false });
  if (vehicle) q = q.eq("vehicle_id", vehicle);
  const { data } = await q;

  const rows: AnomalyRow[] = ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: a.id as string,
    vehicle: (a.vehicle as { registration?: string } | null)?.registration ?? "",
    driver: (a.driver as { full_name?: string } | null)?.full_name ?? "",
    description: a.description as string,
    action_required: (a.action_required as string) ?? "",
    when_to_act: a.when_to_act as string,
    status: a.status as string,
    date_opened: a.date_opened as string,
    date_closed: (a.date_closed as string) ?? null,
    inspection_href: a.daily_inspection_id ? `/inspections/daily/${a.daily_inspection_id}` : `/inspections/third-party/${a.third_party_inspection_id}`,
  }));

  return (
    <>
      <PageHeader title={t("inspections.anomalies.title")} description={t("inspections.anomalies.description")} />
      <AnomaliesTable rows={rows} canClose={session.can("inspections", "approve")} />
    </>
  );
}
