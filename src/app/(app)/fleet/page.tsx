import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { VehiclesTable, type VehicleRow } from "./vehicles-table";
import { t } from "@/i18n";

export default async function FleetPage() {
  const session = await requirePermission("fleet.details", "view");
  const supabase = await createClient();

  const [{ data: vehicles }, { data: safety }, { data: insurance }, { data: inspections }, { data: schedules }] = await Promise.all([
    supabase.from("vehicles").select("*, site:sites(name)").is("deleted_at", null).order("registration"),
    supabase.from("v_vehicle_safety").select("*"),
    supabase.from("vehicle_insurance").select("vehicle_id, end_date").is("deleted_at", null).order("end_date", { ascending: false }),
    supabase.from("vehicle_inspections").select("vehicle_id, kind, renewal_date").is("deleted_at", null).order("renewal_date", { ascending: false }),
    supabase.from("service_schedules").select("vehicle_id, next_service_km").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);

  const safetyMap = new Map((safety ?? []).map((s: { vehicle_id: string; not_safe_for_use: boolean; open_anomalies: number }) => [s.vehicle_id, s]));
  const latest = <T extends { vehicle_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T>();
    for (const r of rows ?? []) if (!m.has(r.vehicle_id)) m.set(r.vehicle_id, r);
    return m;
  };
  const insMap = latest((insurance ?? []) as { vehicle_id: string; end_date: string }[]);
  const internalMap = latest(((inspections ?? []) as { vehicle_id: string; kind: string; renewal_date: string }[]).filter((i) => i.kind === "internal"));
  const thirdMap = latest(((inspections ?? []) as { vehicle_id: string; kind: string; renewal_date: string }[]).filter((i) => i.kind === "third_party"));
  const schedMap = latest((schedules ?? []) as { vehicle_id: string; next_service_km: number }[]);

  const rows: VehicleRow[] = ((vehicles ?? []) as Record<string, unknown>[]).map((v) => ({
    id: v.id as string,
    registration: v.registration as string,
    make: v.make as string,
    model: v.model as string,
    yom: v.yom as number | null,
    location: (v.location as string) ?? (v.site as { name?: string } | null)?.name ?? null,
    odometer_km: v.odometer_km as number,
    status: v.status as string,
    not_safe: safetyMap.get(v.id as string)?.not_safe_for_use ?? false,
    open_anomalies: safetyMap.get(v.id as string)?.open_anomalies ?? 0,
    insurance_end: insMap.get(v.id as string)?.end_date ?? null,
    internal_renewal: internalMap.get(v.id as string)?.renewal_date ?? null,
    third_party_next: thirdMap.get(v.id as string)?.renewal_date ?? null,
    next_service_km: schedMap.get(v.id as string)?.next_service_km ?? null,
  }));

  const max = session.subscription?.maxVehicles ?? null;
  const atLimit = !session.permissions.isOwner && max !== null && rows.length >= max;

  return (
    <>
      <PageHeader
        title={t("fleet.title")}
        description={t("fleet.description")}
        actions={
          session.can("fleet.details", "create") && !atLimit ? (
            <Button asChild className="h-10">
              <Link href="/fleet/new">
                <Plus /> {t("fleet.add_vehicle")}
              </Link>
            </Button>
          ) : null
        }
      />
      {max !== null ? (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${atLimit ? "border-warning/50 bg-warning-bg text-warning" : "bg-card"}`}>
          <span className="font-medium">{atLimit ? t("subscription.vehicle_limit_reached", { max }) : t("subscription.vehicle_limit", { count: rows.length, max })}</span>
          <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={rows.length} aria-label={t("subscription.vehicles")}>
            <div className={`h-full ${atLimit ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.round((rows.length / max) * 100))}%` }} />
          </div>
        </div>
      ) : null}
      <VehiclesTable rows={rows} />
    </>
  );
}
