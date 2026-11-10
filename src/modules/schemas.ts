import type { FormSchema } from "@/lib/forms/schema";
import { MODULES } from "./registry";
import { insuranceSchema, internalInspectionSchema, serviceScheduleSchema, thirdPartyStatusSchema, vehicleDetailsSchema } from "./fleet";
import { driverCourseSchema, driverLicenceSchema, driverOshaSchema, driverPersonalSchema } from "./drivers";

/**
 * Form schemas by key. Schemas hold functions (compute, defaultRow), so server components pass
 * a key and the client SchemaForm resolves it here.
 */
export const SCHEMAS: Record<string, FormSchema> = {
  ...Object.fromEntries(MODULES.map((m) => [m.key, m.schema])),
  "fleet.details": vehicleDetailsSchema,
  "fleet.inspection.internal": internalInspectionSchema,
  "fleet.inspection.third_party": thirdPartyStatusSchema,
  "fleet.insurance": insuranceSchema,
  "fleet.maintenance_schedule": serviceScheduleSchema,
  "drivers.personal": driverPersonalSchema,
  "drivers.training": driverCourseSchema,
  "drivers.licence": driverLicenceSchema,
  "drivers.osha": driverOshaSchema,
};

export function getSchema(key: string): FormSchema {
  const s = SCHEMAS[key];
  if (!s) throw new Error(`Unknown form schema ${key}`);
  return s;
}
