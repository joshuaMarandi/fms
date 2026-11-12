import { createClient } from "@/lib/supabase/server";

export type HubRow = {
  id: string;
  registration: string;
  make: string;
  model: string;
  odometer_km: number | null;
  status: string;
  status_reason: string | null;
  not_safe: boolean;
  a: Record<string, unknown>;
};

/** Vehicles with their per-vehicle activity (v_vehicle_activity) and safety flag. */
export async function loadHubVehicles(): Promise<HubRow[]> {
  const supabase = await createClient();
  const [{ data: vehicles }, { data: activity }, { data: safety }] = await Promise.all([
    supabase.from("vehicles").select("id, registration, make, model, odometer_km, status, status_reason").is("deleted_at", null).order("registration"),
    supabase.from("v_vehicle_activity").select("*"),
    supabase.from("v_vehicle_safety").select("vehicle_id, not_safe_for_use"),
  ]);
  const act = new Map(((activity ?? []) as Record<string, unknown>[]).map((r) => [r.vehicle_id as string, r]));
  const safe = new Map(((safety ?? []) as { vehicle_id: string; not_safe_for_use: boolean }[]).map((r) => [r.vehicle_id, r.not_safe_for_use]));
  return ((vehicles ?? []) as Record<string, unknown>[]).map((v) => ({
    id: v.id as string,
    registration: v.registration as string,
    make: (v.make as string) ?? "",
    model: (v.model as string) ?? "",
    odometer_km: (v.odometer_km as number) ?? null,
    status: v.status as string,
    status_reason: (v.status_reason as string) ?? null,
    not_safe: safe.get(v.id as string) ?? false,
    a: act.get(v.id as string) ?? {},
  }));
}

export const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
