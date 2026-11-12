import type { FormSchema } from "@/lib/forms/schema";

/** Module 1. Fleet database: one page per vehicle with tabs. Each tab is its own schema. */
export const vehicleDetailsSchema: FormSchema = {
  table: "vehicles",
  resource: "fleet.details",
  titleField: "registration",
  sections: [
    {
      title: "fleet.tab.details",
      fields: [
        { name: "make", label: "fleet.make", control: "text", required: true },
        { name: "model", label: "fleet.model", control: "text", required: true },
        { name: "registration", label: "fleet.registration", control: "text", required: true, noSpaces: true, description: "fleet.registration_hint" },
        { name: "chassis_number", label: "fleet.chassis_number", control: "text" },
        { name: "engine_number", label: "fleet.engine_number", control: "text" },
        {
          name: "engine_type",
          label: "fleet.engine_type",
          control: "radio",
          inline: true,
          required: true,
          description: "fleet.engine_type_hint",
          options: [
            { value: "diesel", label: "engine.diesel" },
            { value: "petrol", label: "engine.petrol" },
            { value: "electric", label: "engine.electric" },
            { value: "gas", label: "engine.gas" },
          ],
        },
        { name: "yom", label: "fleet.yom", control: "year", from: 1980 },
        { name: "year_first_use", label: "fleet.year_first_use", control: "year", from: 1980 },
        { name: "site_id", label: "fleet.site", control: "select", source: "sites" },
        { name: "location", label: "fleet.location", control: "text" },
        { name: "odometer_km", label: "fleet.odometer", control: "number", min: 0, unit: "km", description: "fleet.odometer_hint" },
        { name: "fuel_tank_capacity_l", label: "fleet.tank_capacity", control: "number", min: 0, unit: "L" },
        { name: "target_km_per_l", label: "fleet.target_consumption", control: "number", min: 0, step: 0.1, unit: "km/L" },
        { name: "owner_name", label: "fleet.owner_name", control: "text" },
        {
          name: "status",
          label: "fleet.status",
          control: "select",
          options: [
            { value: "in_service", label: "status.in_service" },
            { value: "out_of_service", label: "status.out_of_service" },
          ],
          required: true,
        },
        { name: "status_reason", label: "fleet.status_reason", control: "textarea", required: true, showWhen: { field: "status", equals: "out_of_service" }, placeholder: "fleet.status_reason_placeholder" },
      ],
    },
  ],
};

export const internalInspectionSchema: FormSchema = {
  table: "vehicle_inspections",
  resource: "fleet.inspection_status",
  sections: [
    {
      title: "fleet.internal_inspection",
      fields: [
        { name: "kind", label: "common.record", control: "hidden" },
        { name: "inspection_date", label: "fleet.internal_inspection_date", control: "date" },
        { name: "renewal_date", label: "fleet.internal_renewal_date", control: "date", description: "Reminder" },
        { name: "notes", label: "common.notes", control: "textarea" },
      ],
    },
  ],
};

export const thirdPartyStatusSchema: FormSchema = {
  table: "vehicle_inspections",
  resource: "fleet.inspection_status",
  sections: [
    {
      title: "fleet.third_party_inspection",
      fields: [
        { name: "kind", label: "common.record", control: "hidden" },
        { name: "inspection_date", label: "fleet.third_party_last_date", control: "date" },
        { name: "renewal_date", label: "fleet.third_party_next_date", control: "date", description: "Reminder" },
        { name: "notes", label: "common.notes", control: "textarea" },
      ],
    },
  ],
};

export const insuranceSchema: FormSchema = {
  table: "vehicle_insurance",
  resource: "fleet.insurance",
  sections: [
    {
      title: "fleet.tab.insurance",
      fields: [
        { name: "insurer", label: "fleet.insurer", control: "text" },
        { name: "policy_number", label: "fleet.policy_number", control: "text" },
        { name: "start_date", label: "fleet.insurance_start", control: "date", required: true },
        { name: "end_date", label: "fleet.insurance_end", control: "date", required: true, description: "Reminder" },
        { name: "premium_tzs", label: "fleet.premium", control: "number", min: 0, unit: "TZS" },
      ],
    },
  ],
};

/** Recording a service done: each save is a new history row; the newest row is the current schedule. */
export const serviceScheduleSchema: FormSchema = {
  table: "service_schedules",
  resource: "fleet.maintenance_schedule",
  sections: [
    {
      title: "fleet.service.record_title",
      description: "fleet.service.record_description",
      fields: [
        { name: "last_service_date", label: "fleet.last_service_date", control: "date", required: true },
        { name: "last_service_km", label: "fleet.last_service_km", control: "number", min: 0, unit: "km", required: true },
        { name: "interval_km", label: "fleet.service_interval", control: "number", min: 1, unit: "km", required: true },
        {
          name: "next_service_km",
          label: "fleet.next_service_km",
          control: "auto",
          format: "km",
          digits: 0,
          compute: (v) => (v.last_service_km !== "" && v.interval_km !== "" && v.last_service_km != null && v.interval_km != null ? Number(v.last_service_km) + Number(v.interval_km) : null),
        },
        { name: "garage", label: "fleet.service.garage", control: "text" },
        { name: "notes", label: "fleet.service.work_done", control: "textarea" },
      ],
    },
  ],
};

export const VEHICLE_DOCUMENTS = [
  "fleet.doc.registration",
  "fleet.doc.history_form",
  "fleet.doc.insurance_policy",
  "fleet.doc.road_safety_sticker",
  "fleet.doc.internal_report",
  "fleet.doc.third_party_report",
];
