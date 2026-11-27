import type { Option } from "@/lib/forms/schema";

/** Vehicle types (mirrors the check on public.vehicles.vehicle_type and the service interval rules). */
export const VEHICLE_TYPES = ["saloon", "suv", "pickup", "van", "minibus", "bus", "light_truck", "heavy_truck", "motorcycle", "tricycle", "other"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_OPTIONS: Option[] = VEHICLE_TYPES.map((k) => ({ value: k, label: `vehicle_type.${k}` }));
