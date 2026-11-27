import type { FormSchema } from "@/lib/forms/schema";
import { VEHICLE_TYPE_OPTIONS } from "@/lib/vehicle-types";
import { formatDate, formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

/** A date some months after another (yyyy-mm-dd). */
function addMonths(date: unknown, months: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  const n = Number(months);
  if (!m || !Number.isFinite(n) || n <= 0) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + n, Number(m[3])));
  return d.toISOString().slice(0, 10);
}

/** Module 1. Fleet database: one page per vehicle with tabs. Each tab is its own schema. */
export const vehicleDetailsSchema: FormSchema = {
  table: "vehicles",
  resource: "fleet.details",
  titleField: "registration",
  viewGroups: [
    { title: "fleet.view.identity", fields: ["registration", "vehicle_type", "make", "model", "engine_type", "yom", "year_first_use", "chassis_number", "engine_number"] },
    { title: "fleet.view.use", fields: ["odometer_km", "fuel_tank_capacity_l", "target_km_per_l", "site_id", "location", "owner_name"] },
    { title: "fleet.view.status", fields: ["status", "status_reason"] },
    { title: "fleet.view.documents", fields: ["documents"] },
  ],
  sections: [
    {
      title: "fleet.tab.details",
      fields: [
        // The type (with make, model and engine) picks the service interval from the company rules.
        { name: "vehicle_type", label: "fleet.vehicle_type", control: "select", options: VEHICLE_TYPE_OPTIONS, required: true, description: "fleet.vehicle_type_hint" },
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
        // Vehicle papers (kept on the vehicle; inspection and insurance papers live on their own tabs).
        { name: "documents", label: "fleet.view.documents", control: "file", bucket: "vehicle-docs", labels: ["fleet.doc.registration", "fleet.doc.history_form", "fleet.doc.road_safety_sticker"] },
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
        { name: "policy", label: "fleet.doc.insurance_policy", control: "file", bucket: "vehicle-docs", labels: ["fleet.doc.insurance_policy"], multiple: false },
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
        // The interval comes from the company rule for this vehicle (Settings, Company), unless the
        // vehicle has its own. With no rule, it is typed here.
        {
          name: "rule_interval",
          label: "fleet.service.rule_interval",
          control: "auto",
          format: "text",
          showWhen: { field: "interval_custom", truthy: false },
          compute: (_v, ctx) => {
            const r = ctx.record as Record<string, unknown> | null | undefined;
            if (!r?.rule_label) return t("fleet.service.no_rule");
            const parts = [r.rule_km ? `${formatNumber(Number(r.rule_km))} km` : null, r.rule_months ? t("fleet.service.months", { count: Number(r.rule_months) }) : null].filter(Boolean);
            return `${r.rule_label}: ${parts.join(` ${t("fleet.service.or")} `)}`;
          },
        },
        { name: "interval_custom", label: "fleet.service.own_interval", control: "checkbox", description: "fleet.service.own_interval_hint" },
        { name: "interval_km", label: "fleet.service_interval", control: "number", min: 1, unit: "km", required: true, showWhen: { field: "interval_custom", truthy: true } },
        { name: "interval_months", label: "fleet.service_interval_months", control: "number", min: 1, max: 60, integer: true, showWhen: { field: "interval_custom", truthy: true } },
        {
          name: "next_service_km",
          label: "fleet.next_service_km",
          control: "auto",
          format: "km",
          digits: 0,
          compute: (v, ctx) => {
            const km = v.interval_custom ? v.interval_km : (ctx.record as Record<string, unknown> | null | undefined)?.rule_km;
            return v.last_service_km !== "" && v.last_service_km != null && km !== "" && km != null ? Number(v.last_service_km) + Number(km) : null;
          },
        },
        {
          name: "next_service_date",
          label: "fleet.next_service_date",
          control: "auto",
          format: "text",
          compute: (v, ctx) => {
            const months = v.interval_custom ? v.interval_months : (ctx.record as Record<string, unknown> | null | undefined)?.rule_months;
            const d = addMonths(v.last_service_date, months);
            return d ? formatDate(d) : null;
          },
        },
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
