import Link from "next/link";
import { BadgeCheck, Gauge, HardHat, Plus, ShieldCheck } from "lucide-react";
import { StatCard } from "@/components/patterns/stat-card";
import type { Tone } from "@/components/patterns/tone";
import { daysFromNowISO, formatNumber, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { VehiclesTable, type VehicleRow } from "./vehicles-table";
import { t } from "@/i18n";

export default async function FleetPage() {
  const session = await requirePermission("fleet.details", "view");
  const supabase = await createClient();

  const [{ data: vehicles }, { data: safety }, { data: insurance }, { data: inspections }, { data: schedules }, { data: activity }, { data: osha }, { data: activeDrivers }] = await Promise.all([
    supabase.from("vehicles").select("*, site:sites(name)").is("deleted_at", null).order("registration"),
    supabase.from("v_vehicle_safety").select("*"),
    supabase.from("vehicle_insurance").select("vehicle_id, end_date").is("deleted_at", null).order("end_date", { ascending: false }),
    supabase.from("vehicle_inspections").select("vehicle_id, kind, renewal_date").eq("kind", "third_party").is("deleted_at", null).order("renewal_date", { ascending: false }),
    supabase.from("service_schedules").select("vehicle_id, next_service_km").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("v_vehicle_activity").select("vehicle_id, third_party_next"),
    session.can("drivers.osha", "view") ? supabase.from("driver_osha").select("driver_id, redo_date").is("deleted_at", null).order("redo_date", { ascending: false }) : Promise.resolve({ data: null }),
    session.can("drivers.osha", "view") ? supabase.from("drivers").select("id").is("deleted_at", null).eq("is_active", true) : Promise.resolve({ data: null }),
  ]);
  // Third-party inspection: the later of the fleet record and the inspections module.
  const tpActivity = new Map(((activity ?? []) as { vehicle_id: string; third_party_next: string | null }[]).map((a) => [a.vehicle_id, a.third_party_next]));

  const safetyMap = new Map((safety ?? []).map((s: { vehicle_id: string; not_safe_for_use: boolean; open_anomalies: number }) => [s.vehicle_id, s]));
  const latest = <T extends { vehicle_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T>();
    for (const r of rows ?? []) if (!m.has(r.vehicle_id)) m.set(r.vehicle_id, r);
    return m;
  };
  const insMap = latest((insurance ?? []) as { vehicle_id: string; end_date: string }[]);
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
    owner_name: (v.owner_name as string) ?? null,
    status: v.status as string,
    status_reason: (v.status_reason as string) ?? null,
    not_safe: safetyMap.get(v.id as string)?.not_safe_for_use ?? false,
    insurance_end: insMap.get(v.id as string)?.end_date ?? null,
    third_party_next: [thirdMap.get(v.id as string)?.renewal_date ?? null, tpActivity.get(v.id as string) ?? null].filter((d): d is string => !!d).sort().pop() ?? null,
    next_service_km: schedMap.get(v.id as string)?.next_service_km ?? null,
  }));

  // Summary cards: insurance, third-party inspection, driver OSHA retests and vehicle status.
  const today = todayISO();
  const in30 = daysFromNowISO(30);
  const dueCounts = (dates: (string | null)[]) => ({
    valid: dates.filter((d) => d && d > in30).length,
    soon: dates.filter((d) => d && d >= today && d <= in30).length,
    expired: dates.filter((d) => d && d < today).length,
    missing: dates.filter((d) => !d).length,
  });
  const ins = dueCounts(rows.map((r) => r.insurance_end));
  const tp = dueCounts(rows.map((r) => r.third_party_next));
  const oshaByDriver = new Map<string, string>();
  for (const o of (osha ?? []) as { driver_id: string; redo_date: string | null }[]) if (!oshaByDriver.has(o.driver_id) && o.redo_date) oshaByDriver.set(o.driver_id, o.redo_date);
  const oshaCounts = activeDrivers ? dueCounts((activeDrivers as { id: string }[]).map((d) => oshaByDriver.get(d.id) ?? null)) : null;
  const inUse = rows.filter((r) => r.status === "in_service" && !r.not_safe).length;
  const notSafe = rows.filter((r) => r.status === "in_service" && r.not_safe).length;
  const outOfUse = rows.filter((r) => r.status === "out_of_service").length;
  const breakdown = (c: { valid: number; soon: number; expired: number; missing: number }) => (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
      <li className="text-success">{t("fleet.summary.valid", { count: c.valid })}</li>
      <li className={c.soon ? "font-medium text-warning" : "text-muted-foreground"}>{t("fleet.summary.soon", { count: c.soon })}</li>
      <li className={c.expired ? "font-medium text-danger" : "text-muted-foreground"}>{t("fleet.summary.expired", { count: c.expired })}</li>
      <li className="text-muted-foreground">{t("fleet.summary.missing", { count: c.missing })}</li>
    </ul>
  );
  const tone = (c: { soon: number; expired: number }, base: Tone): Tone => (c.expired ? "red" : c.soon ? "amber" : base);

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t("fleet.summary.insurance")} value={`${formatNumber(rows.length - ins.expired - ins.missing)} / ${formatNumber(rows.length)}`} href="#vehicle-list" icon={ShieldCheck} tone={tone(ins, "green")}>
          {breakdown(ins)}
        </StatCard>
        <StatCard title={t("fleet.summary.third_party")} value={`${formatNumber(rows.length - tp.expired - tp.missing)} / ${formatNumber(rows.length)}`} href="#vehicle-list" icon={BadgeCheck} tone={tone(tp, "blue")}>
          {breakdown(tp)}
        </StatCard>
        {oshaCounts ? (
          <StatCard title={t("fleet.summary.osha")} value={`${formatNumber(oshaCounts.valid + oshaCounts.soon)} / ${formatNumber((activeDrivers ?? []).length)}`} href="/drivers" icon={HardHat} tone={tone(oshaCounts, "purple")}>
            {breakdown(oshaCounts)}
          </StatCard>
        ) : null}
        <StatCard title={t("fleet.summary.status")} value={`${formatNumber(inUse)} / ${formatNumber(rows.length)}`} href="#vehicle-list" icon={Gauge} tone={notSafe ? "red" : outOfUse ? "amber" : "green"}>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <li className="text-success">{t("fleet.summary.in_use", { count: inUse })}</li>
            <li className={outOfUse ? "font-medium text-warning" : "text-muted-foreground"}>{t("fleet.summary.out_of_use", { count: outOfUse })}</li>
            {notSafe ? <li className="col-span-2 font-medium text-danger">{t("fleet.summary.not_safe", { count: notSafe })}</li> : null}
          </ul>
        </StatCard>
      </div>
      <div id="vehicle-list" className="scroll-mt-20">
        <VehiclesTable rows={rows} />
      </div>
    </>
  );
}
