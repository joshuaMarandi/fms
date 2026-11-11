import type { ModuleDef } from "./types";
import type { Field, Option } from "@/lib/forms/schema";
import { MONTH_OPTIONS } from "@/lib/forms/schema";

export const TZ_REGIONS = [
  "Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera", "Katavi", "Kigoma", "Kilimanjaro", "Lindi", "Manyara", "Mara", "Mbeya", "Morogoro", "Mtwara", "Mwanza", "Njombe", "Pemba North", "Pemba South", "Pwani", "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe", "Tabora", "Tanga", "Unguja North", "Unguja South", "Unguja Urban West",
];

/** Read-only employee details shown from the chosen user (the database fills the columns). */
const fromEmployee = (field: string) => (v: Record<string, unknown>, ctx: { options: { profiles?: Record<string, unknown>[] }; session: { userId: string } }) => {
  const id = (v.employee_id as string) || ctx.session.userId;
  const p = (ctx.options.profiles ?? []).find((o) => o.value === id);
  return (p?.[field] as string) || (v[field] as string) || null;
};

const num = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const safe = (v: number) => (Number.isNaN(v) || !Number.isFinite(v) ? null : v);

const vehicleField: Field = { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles", required: true };
const driverField: Field = { name: "driver_id", label: "inspections.driver_name", control: "select", source: "drivers", description: "Auto: the current driver when left empty" };

export const fuelExpenses: ModuleDef = {
  key: "expenses.fuel",
  path: "/expenses/fuel",
  resource: "expenses.fuel",
  table: "fuel_expenses",
  title: "expenses.fuel.title",
  description: "expenses.fuel.description",
  newLabel: "common.new",
  exportName: "fuel-expenses",
  optionSources: ["vehicles"],
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.expense_date ?? ""}`.trim(),
  schema: {
    table: "fuel_expenses",
    resource: "expenses.fuel",
    sections: [
      {
        fields: [
          { name: "expense_date", label: "common.date", control: "date", required: true },
          vehicleField,
          { name: "km_start", label: "expenses.fuel.km_start", control: "number", min: 0, unit: "km", required: true },
          { name: "km_end", label: "expenses.fuel.km_end", control: "number", min: 0, unit: "km", required: true },
          { name: "km_run", label: "expenses.fuel.km_run", control: "auto", format: "km", compute: (v) => safe(num(v.km_end) - num(v.km_start)) },
          { name: "target_km_per_l", label: "expenses.fuel.target", control: "number", min: 0, step: 0.1, unit: "km/L", description: "Defaults to the vehicle target" },
          { name: "fuel_consumed_l", label: "expenses.fuel.consumed", control: "number", min: 0, unit: "L", required: true },
          { name: "attained_km_per_l", label: "expenses.fuel.attained", control: "auto", format: "number", digits: 2, compute: (v) => safe((num(v.km_end) - num(v.km_start)) / num(v.fuel_consumed_l)) },
          { name: "price_per_litre", label: "expenses.fuel.price", control: "number", min: 0, unit: "TZS", description: "expenses.fuel.price_hint" },
          { name: "amount_tzs", label: "expenses.fuel.amount", control: "auto", format: "tzs", compute: (v) => safe(num(v.fuel_consumed_l) * num(v.price_per_litre)) },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "expense_date", ascending: false },
    searchKeys: ["vehicle.registration"],
    columns: [
      { key: "expense_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "km_run", header: "expenses.fuel.km_run", type: "km" },
      { key: "fuel_consumed_l", header: "expenses.fuel.consumed", type: "litres" },
      { key: "target_km_per_l", header: "expenses.fuel.target", type: "number", digits: 1 },
      { key: "attained_km_per_l", header: "expenses.fuel.attained", type: "number", digits: 2 },
      { key: "price_per_litre", header: "expenses.fuel.price", type: "tzs" },
      { key: "amount_tzs", header: "expenses.fuel.amount", type: "tzs" },
    ],
  },
};

const FAULTS: Option[] = ["engine", "engine_oil", "filters", "gearbox", "brakes", "suspension", "electrical", "cooling", "tyres", "body", "ac", "other"].map((k) => ({ value: k, label: `expenses.maintenance.fault.${k}` }));

export const maintenanceRequests: ModuleDef = {
  key: "expenses.maintenance.requests",
  path: "/expenses/maintenance/requests",
  resource: "expenses.maintenance.requests",
  table: "maintenance_requests",
  title: "expenses.maintenance.requests.title",
  description: "expenses.maintenance.requests.description",
  newLabel: "expenses.maintenance.new",
  exportName: "maintenance-requests",
  optionSources: ["vehicles", "drivers"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  detailExtra: "works_order",
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.request_date ?? ""}`.trim(),
  approvalExtra: () => [
    { name: "approver_name", label: "approval.approver_name", control: "text", required: true },
    { name: "approver_position", label: "approval.approver_position", control: "text", required: true },
  ],
  schema: {
    table: "maintenance_requests",
    resource: "expenses.maintenance.requests",
    isRequest: true,
    sections: [
      {
        fields: [
          { name: "requester_name", label: "expenses.maintenance.requester", control: "auto", compute: (_v, ctx) => ctx.session.fullName },
          driverField,
          vehicleField,
          { name: "request_date", label: "common.date", control: "date", required: true },
          { name: "odometer_km", label: "expenses.maintenance.odometer", control: "number", min: 0, unit: "km", required: true },
          {
            name: "reason",
            label: "expenses.maintenance.reason",
            control: "radio",
            required: true,
            options: ["ppm", "corrective", "breakdown", "accident", "other"].map((k) => ({ value: k, label: `expenses.maintenance.reason.${k}` })),
          },
          { name: "reason_other", label: "expenses.maintenance.reason_other", control: "textarea", required: true, showWhen: { field: "reason", equals: "other" } },
          { name: "faults", label: "expenses.maintenance.faults", control: "checkbox_group", options: FAULTS, columns: 3, required: true },
          { name: "fault_details", label: "expenses.maintenance.fault_details", control: "textarea" },
          { name: "confirmation", label: "expenses.maintenance.confirmation", control: "signature", required: true },
        ],
      },
      {
        title: "common.documents",
        description: "common.documents_hint",
        fields: [{ name: "documents", label: "common.attachments", control: "file", bucket: "forms", labels: ["expenses.maintenance.doc.fault_photos", "expenses.maintenance.doc.inspection_report"] }],
      }
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration), driver:drivers(full_name)",
    orderBy: { column: "request_date", ascending: false },
    searchKeys: ["vehicle.registration", "driver.full_name", "reason", "status"],
    statusColumn: "status",
    columns: [
      { key: "request_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "driver.full_name", header: "inspections.driver_name" },
      { key: "reason", header: "expenses.maintenance.reason", type: "label", options: ["ppm", "corrective", "breakdown", "accident", "other"].map((k) => ({ value: k, label: `expenses.maintenance.reason.${k}` })) },
      { key: "faults", header: "expenses.maintenance.faults", type: "tags", options: FAULTS },
      { key: "odometer_km", header: "expenses.maintenance.odometer", type: "km" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

export const workOrders: ModuleDef = {
  key: "expenses.maintenance.work_orders",
  path: "/expenses/maintenance/work-orders",
  resource: "expenses.maintenance.work_orders",
  table: "work_orders",
  title: "expenses.maintenance.work_orders.title",
  description: "expenses.maintenance.work_orders.description",
  newLabel: "expenses.maintenance.work_orders.new",
  exportName: "work-orders",
  optionSources: ["vehicles", "maintenance_requests"],
  titleOf: (r) => `${r.order_number ?? ""} ${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""}`.trim(),
  schema: {
    table: "work_orders",
    resource: "expenses.maintenance.work_orders",
    sections: [
      {
        title: "expenses.maintenance.works_order",
        fields: [
          vehicleField,
          { name: "maintenance_request_id", label: "expenses.maintenance.requests.title", control: "select", source: "maintenance_requests", sourceFilter: (o, v) => !v.vehicle_id || o.vehicle_id === v.vehicle_id },
          { name: "order_number", label: "expenses.maintenance.order_number", control: "text" },
          { name: "garage_name", label: "expenses.maintenance.garage", control: "text", required: true },
          { name: "description", label: "expenses.maintenance.work_description", control: "textarea", required: true },
        ],
      },
      {
        title: "expenses.maintenance.work_orders.title",
        fields: [
          { name: "date_out", label: "expenses.maintenance.date_out", control: "date", required: true },
          { name: "date_in", label: "expenses.maintenance.date_in", control: "date" },
          { name: "odometer_out", label: "expenses.maintenance.odometer_out", control: "number", min: 0, unit: "km" },
          { name: "odometer_in", label: "expenses.maintenance.odometer_in", control: "number", min: 0, unit: "km" },
          { name: "total_days", label: "expenses.maintenance.total_days", control: "auto", format: "number", digits: 0, compute: (v) => (v.date_in && v.date_out ? Math.round((new Date(v.date_in as string).getTime() - new Date(v.date_out as string).getTime()) / 86400000) : null) },
          { name: "mileage_during_repairs", label: "expenses.maintenance.mileage_during", control: "auto", format: "km", compute: (v) => safe(num(v.odometer_in) - num(v.odometer_out)) },
        ],
      },
      {
        title: "common.documents",
        description: "common.documents_hint",
        fields: [{ name: "documents", label: "common.attachments", control: "file", bucket: "forms", labels: ["expenses.maintenance.doc.works_order", "expenses.maintenance.doc.job_card", "expenses.maintenance.doc.invoice", "expenses.maintenance.doc.photos"] }],
      }
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "date_out", ascending: false },
    searchKeys: ["vehicle.registration", "garage_name", "order_number"],
    statusColumn: "status",
    columns: [
      { key: "order_number", header: "expenses.maintenance.order_number" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "garage_name", header: "expenses.maintenance.garage" },
      { key: "date_out", header: "expenses.maintenance.date_out", type: "date" },
      { key: "date_in", header: "expenses.maintenance.date_in", type: "date" },
      { key: "total_days", header: "expenses.maintenance.total_days", type: "number", digits: 0 },
      { key: "mileage_during_repairs", header: "expenses.maintenance.mileage_during", type: "km" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

export const maintenanceCosts: ModuleDef = {
  key: "expenses.maintenance.costs",
  path: "/expenses/maintenance/costs",
  resource: "expenses.maintenance.costs",
  table: "maintenance_costs",
  title: "expenses.maintenance.costs.title",
  description: "expenses.maintenance.costs.description",
  newLabel: "expenses.maintenance.costs.new",
  exportName: "maintenance-costs",
  optionSources: ["vehicles", "work_orders"],
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.cost_date ?? ""}`.trim(),
  schema: {
    table: "maintenance_costs",
    resource: "expenses.maintenance.costs",
    sections: [
      {
        fields: [
          vehicleField,
          { name: "work_order_id", label: "expenses.maintenance.order_number", control: "select", source: "work_orders", sourceFilter: (o, v) => !v.vehicle_id || o.vehicle_id === v.vehicle_id },
          { name: "cost_date", label: "common.date", control: "date", required: true },
          { name: "odometer_km", label: "expenses.maintenance.odometer", control: "number", min: 0, unit: "km" },
          {
            name: "work_type",
            label: "expenses.maintenance.work_type",
            control: "radio",
            required: true,
            inline: true,
            options: [
              { value: "maintenance", label: "expenses.maintenance.work_type.maintenance" },
              { value: "repairs", label: "expenses.maintenance.work_type.repairs" },
            ],
          },
          { name: "service_provider", label: "expenses.maintenance.provider", control: "text", required: true },
          { name: "activities", label: "expenses.maintenance.activities", control: "textarea", required: true },
          { name: "cost_tzs", label: "expenses.maintenance.cost", control: "number", min: 0, unit: "TZS", required: true },
          {
            name: "docs",
            label: "common.attachments",
            control: "file",
            bucket: "forms",
            labels: ["expenses.maintenance.doc.ppm_checklist", "expenses.maintenance.doc.works_order", "expenses.maintenance.doc.repair_estimate", "expenses.maintenance.doc.purchase_order"],
          },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "cost_date", ascending: false },
    searchKeys: ["vehicle.registration", "service_provider", "activities"],
    columns: [
      { key: "cost_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "work_type", header: "expenses.maintenance.work_type", type: "label", options: [{ value: "maintenance", label: "expenses.maintenance.work_type.maintenance" }, { value: "repairs", label: "expenses.maintenance.work_type.repairs" }] },
      { key: "service_provider", header: "expenses.maintenance.provider" },
      { key: "odometer_km", header: "expenses.maintenance.odometer", type: "km" },
      { key: "cost_tzs", header: "expenses.maintenance.cost", type: "tzs" },
    ],
  },
};

export const tyreRequests: ModuleDef = {
  key: "expenses.tyres",
  path: "/expenses/tyres",
  resource: "expenses.tyres",
  table: "tyre_requests",
  title: "expenses.tyres.title",
  description: "expenses.tyres.description",
  newLabel: "expenses.tyres.new",
  exportName: "tyre-requests",
  optionSources: ["vehicles", "drivers"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.request_date ?? ""}`.trim(),
  schema: {
    table: "tyre_requests",
    resource: "expenses.tyres",
    isRequest: true,
    sections: [
      {
        fields: [
          vehicleField,
          driverField,
          { name: "previous_request_date", label: "expenses.tyres.previous_date", control: "auto", format: "date", compute: (v) => v.previous_request_date ?? null },
          { name: "previous_odometer_km", label: "expenses.tyres.previous_odometer", control: "auto", format: "km", compute: (v) => v.previous_odometer_km ?? null },
          { name: "request_date", label: "expenses.tyres.request_date", control: "date", required: true },
          { name: "odometer_km", label: "expenses.tyres.odometer", control: "number", min: 0, unit: "km", required: true },
          { name: "tyre_size", label: "expenses.tyres.size", control: "text", required: true, placeholder: "265/70 R16" },
          { name: "tyre_make", label: "expenses.tyres.make", control: "text", required: true },
          { name: "tyre_brand", label: "expenses.tyres.brand", control: "text" },
          { name: "quantity", label: "expenses.tyres.quantity", control: "number", min: 1, integer: true, required: true },
          { name: "unit_cost_tzs", label: "expenses.tyres.unit_cost", control: "number", min: 0, unit: "TZS", required: true },
          { name: "total_cost_tzs", label: "expenses.tyres.total", control: "auto", format: "tzs", compute: (v) => safe(num(v.quantity) * num(v.unit_cost_tzs)) },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "request_date", ascending: false },
    searchKeys: ["vehicle.registration", "tyre_make", "tyre_size", "status"],
    statusColumn: "status",
    columns: [
      { key: "request_date", header: "expenses.tyres.request_date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "tyre_size", header: "expenses.tyres.size" },
      { key: "tyre_make", header: "expenses.tyres.make" },
      { key: "quantity", header: "expenses.tyres.quantity", type: "number", digits: 0 },
      { key: "total_cost_tzs", header: "expenses.tyres.total", type: "tzs" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

const WASH_CATEGORIES: Option[] = ["full", "body", "interior", "engine"].map((k) => ({ value: k, label: `expenses.washing.category.${k}` }));

export const washRequests: ModuleDef = {
  key: "expenses.washing",
  path: "/expenses/washing",
  resource: "expenses.washing",
  table: "wash_requests",
  title: "expenses.washing.title",
  description: "expenses.washing.description",
  newLabel: "expenses.washing.new",
  exportName: "wash-requests",
  optionSources: ["vehicles", "drivers"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  listExtra: "wash_report",
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.request_date ?? ""}`.trim(),
  schema: {
    table: "wash_requests",
    resource: "expenses.washing",
    isRequest: true,
    sections: [
      {
        fields: [
          vehicleField,
          driverField,
          { name: "request_date", label: "common.date", control: "date", required: true },
          { name: "odometer_km", label: "expenses.maintenance.odometer", control: "number", min: 0, unit: "km", required: true },
          { name: "categories", label: "expenses.washing.category", control: "checkbox_group", options: WASH_CATEGORIES, required: true },
          { name: "service_provider", label: "expenses.washing.provider", control: "text" },
          { name: "cost_tzs", label: "expenses.washing.cost", control: "auto", format: "tzs", description: "Auto: from the price list of the categories ticked, calculated when saved", compute: (v, ctx) => (v.cost_tzs as number) ?? (ctx.record?.cost_tzs as number) ?? null },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "request_date", ascending: false },
    searchKeys: ["vehicle.registration", "service_provider", "status"],
    statusColumn: "status",
    columns: [
      { key: "request_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "categories", header: "expenses.washing.category", type: "tags", options: WASH_CATEGORIES },
      { key: "service_provider", header: "expenses.washing.provider" },
      { key: "cost_tzs", header: "expenses.washing.cost", type: "tzs" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

const EQUIPMENT: Option[] = ["wheel_spanner", "wheel_chocks", "lifting_jack", "reflective_triangles", "spare_tyre", "fire_extinguisher", "first_aid_box", "jumping_cable", "towing_rope", "spade"].map((k) => ({ value: k, label: `expenses.equipment.item.${k}` }));

export const vehicleEquipment: ModuleDef = {
  key: "expenses.equipment",
  path: "/expenses/equipment",
  resource: "expenses.equipment",
  table: "vehicle_equipment",
  title: "expenses.equipment.title",
  description: "expenses.equipment.description",
  newLabel: "expenses.equipment.new",
  exportName: "vehicle-equipment",
  optionSources: ["vehicles"],
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.check_date ?? ""}`.trim(),
  schema: {
    table: "vehicle_equipment",
    resource: "expenses.equipment",
    sections: [
      {
        fields: [
          vehicleField,
          { name: "check_date", label: "common.date", control: "date", required: true },
          { name: "items", label: "expenses.equipment.items", control: "checkbox_group", options: EQUIPMENT, columns: 2 },
          { name: "remarks", label: "common.remarks", control: "textarea" },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "check_date", ascending: false },
    searchKeys: ["vehicle.registration"],
    columns: [
      { key: "check_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "items", header: "expenses.equipment.items", type: "tags", options: EQUIPMENT },
      { key: "remarks", header: "common.remarks" },
    ],
  },
};

const COURSES: Option[] = ["defensive_driving", "four_wd", "fatigue", "night_driving"].map((k) => ({ value: k, label: `expenses.trainings.course.${k}` }));

export const mandatoryTrainings: ModuleDef = {
  key: "expenses.trainings.mandatory",
  path: "/expenses/trainings/mandatory",
  resource: "expenses.trainings.mandatory",
  table: "mandatory_trainings",
  title: "expenses.trainings.mandatory.title",
  description: "expenses.trainings.mandatory.description",
  newLabel: "expenses.trainings.mandatory.new",
  exportName: "mandatory-trainings",
  optionSources: ["drivers"],
  titleOf: (r) => `${(r.driver as { full_name?: string } | undefined)?.full_name ?? ""}`,
  schema: {
    table: "mandatory_trainings",
    resource: "expenses.trainings.mandatory",
    sections: [
      {
        fields: [
          { name: "driver_id", label: "inspections.driver_name", control: "select", source: "drivers", required: true },
          { name: "courses", label: "expenses.trainings.courses", control: "checkbox_group", options: COURSES, required: true },
          { name: "date_completed", label: "expenses.trainings.date_completed", control: "date", required: true },
          { name: "trainer", label: "expenses.trainings.trainer", control: "text" },
          { name: "cost_tzs", label: "expenses.trainings.cost", control: "number", min: 0, unit: "TZS" },
          { name: "refresher_date", label: "expenses.trainings.refresher", control: "date", description: "Reminder" },
        ],
      },
      {
        title: "common.documents",
        description: "common.documents_hint",
        fields: [{ name: "documents", label: "common.attachments", control: "file", bucket: "driver-docs", labels: ["drivers.doc.course_certificates", "expenses.trainings.doc.attendance", "expenses.trainings.doc.invoice"] }],
      }
    ],
  },
  list: {
    select: "*, driver:drivers(full_name)",
    orderBy: { column: "date_completed", ascending: false },
    searchKeys: ["driver.full_name", "trainer"],
    columns: [
      { key: "driver.full_name", header: "inspections.driver_name" },
      { key: "courses", header: "expenses.trainings.courses", type: "tags", options: COURSES },
      { key: "date_completed", header: "expenses.trainings.date_completed", type: "date" },
      { key: "trainer", header: "expenses.trainings.trainer" },
      { key: "cost_tzs", header: "expenses.trainings.cost", type: "tzs" },
      { key: "refresher_date", header: "expenses.trainings.refresher", type: "reminder" },
    ],
  },
};

export const toolboxPlans: ModuleDef = {
  key: "expenses.trainings.toolbox",
  path: "/expenses/trainings/toolbox",
  resource: "expenses.trainings.toolbox",
  table: "toolbox_plans",
  title: "expenses.trainings.toolbox.title",
  description: "expenses.trainings.toolbox.description",
  newLabel: "expenses.trainings.toolbox.new",
  exportName: "toolbox-talks",
  optionSources: [],
  titleOf: (r) => `${r.week_number ? `W${r.week_number} ` : ""}${r.date_from ?? ""}`,
  schema: {
    table: "toolbox_plans",
    resource: "expenses.trainings.toolbox",
    sections: [
      {
        fields: [
          { name: "week_number", label: "expenses.trainings.week", control: "number", min: 1, max: 53, integer: true, required: true },
          { name: "month", label: "expenses.trainings.month", control: "select", options: MONTH_OPTIONS, required: true },
          { name: "date_from", label: "expenses.trainings.date_from", control: "date", required: true },
          { name: "date_to", label: "expenses.trainings.date_to", control: "date", required: true },
          { name: "topics", label: "expenses.trainings.topics", control: "textarea", required: true },
        ],
      },
    ],
  },
  list: {
    select: "*",
    orderBy: { column: "date_from", ascending: false },
    searchKeys: ["topics"],
    columns: [
      { key: "week_number", header: "expenses.trainings.week", type: "number", digits: 0 },
      { key: "month", header: "expenses.trainings.month", type: "label", options: MONTH_OPTIONS },
      { key: "date_from", header: "expenses.trainings.date_from", type: "date" },
      { key: "date_to", header: "expenses.trainings.date_to", type: "date" },
      { key: "topics", header: "expenses.trainings.topics" },
    ],
  },
};

const DAY_TYPES: Option[] = ["work", "rest", "leave", "public_holiday", "sick"].map((k) => ({ value: k, label: `expenses.timesheet.day_type.${k}` }));

export const timesheets: ModuleDef = {
  key: "expenses.timesheet",
  path: "/expenses/timesheet",
  resource: "expenses.timesheet",
  table: "timesheets",
  title: "expenses.timesheet.title",
  description: "expenses.timesheet.description",
  newLabel: "expenses.timesheet.new",
  exportName: "timesheets",
  optionSources: ["drivers", "profiles"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  titleOf: (r) => `${r.employee_name ?? ""} ${r.period_month ? String(r.period_month).slice(0, 7) : ""}`.trim(),
  schema: {
    table: "timesheets",
    resource: "expenses.timesheet",
    isRequest: true,
    sections: [
      {
        fields: [
          { name: "employee_id", label: "expenses.timesheet.employee", control: "select", source: "profiles", description: "expenses.employee_hint" },
          { name: "employment_number", label: "expenses.timesheet.employment_number", control: "auto", compute: fromEmployee("employment_number") },
          { name: "employer", label: "expenses.timesheet.employer", control: "auto", compute: fromEmployee("employer") },
          { name: "job_title", label: "expenses.timesheet.job_title", control: "auto", compute: fromEmployee("job_title") },
          { name: "department", label: "expenses.timesheet.department", control: "auto", compute: fromEmployee("department") },
          { name: "period_month", label: "expenses.timesheet.period", control: "date", required: true, description: "Pick the first day of the month" },
        ],
      },
      {
        title: "expenses.timesheet.days",
        fields: [
          {
            name: "days",
            label: "expenses.timesheet.days",
            control: "rows",
            childTable: "timesheet_days",
            fk: "timesheet_id",
            minRows: 1,
            fields: [
              { name: "work_date", label: "expenses.timesheet.work_date", control: "date", required: true },
              { name: "day_type", label: "expenses.timesheet.day_type", control: "select", options: DAY_TYPES, required: true },
              { name: "time_in", label: "expenses.timesheet.time_in", control: "time" },
              { name: "time_out", label: "expenses.timesheet.time_out", control: "time" },
              { name: "normal_hours", label: "expenses.timesheet.normal_hours", control: "number", min: 0, max: 24, step: 0.25, unit: "h" },
              { name: "overtime_hours", label: "expenses.timesheet.overtime_hours", control: "number", min: 0, max: 24, step: 0.25, unit: "h" },
              { name: "remarks", label: "common.remarks", control: "text" },
            ],
            defaultRow: (values, rows) => {
              const last = rows[rows.length - 1]?.work_date as string | undefined;
              const base = last ? new Date(last + "T00:00:00") : values.period_month ? new Date((values.period_month as string) + "T00:00:00") : new Date();
              if (last) base.setDate(base.getDate() + 1);
              return { work_date: base.toISOString().slice(0, 10), day_type: "work", time_in: "07:30", time_out: "17:00", normal_hours: 8, overtime_hours: 1.5, remarks: "" };
            },
            totals: [
              { label: "expenses.timesheet.total_normal", format: "number", compute: (rows) => rows.reduce((s, r) => s + (Number(r.normal_hours) || 0), 0) },
              { label: "expenses.timesheet.total_overtime", format: "number", compute: (rows) => rows.reduce((s, r) => s + (Number(r.overtime_hours) || 0), 0) },
            ],
          },
        ],
      },
    ],
  },
  list: {
    select: "*",
    orderBy: { column: "period_month", ascending: false },
    searchKeys: ["employee_name", "department", "status"],
    statusColumn: "status",
    columns: [
      { key: "period_month", header: "expenses.timesheet.period", type: "date" },
      { key: "employee_name", header: "expenses.timesheet.employee" },
      { key: "department", header: "expenses.timesheet.department" },
      { key: "total_normal_hours", header: "expenses.timesheet.total_normal", type: "hours" },
      { key: "total_overtime_hours", header: "expenses.timesheet.total_overtime", type: "hours" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

export const leavePlans: ModuleDef = {
  key: "expenses.leave.plan",
  path: "/expenses/leave/plan",
  resource: "expenses.leave.plan",
  table: "leave_plans",
  title: "expenses.leave.plan.title",
  description: "expenses.leave.plan.description",
  newLabel: "expenses.leave.plan.new",
  exportName: "leave-plans",
  optionSources: ["profiles", "leave_categories"],
  titleOf: (r) => `${r.employee_name ?? ""} ${r.plan_year ?? ""}`.trim(),
  schema: {
    table: "leave_plans",
    resource: "expenses.leave.plan",
    sections: [
      {
        fields: [
          { name: "employee_id", label: "expenses.leave.name", control: "select", source: "profiles", description: "expenses.employee_hint" },
          { name: "employment_number", label: "expenses.leave.employment_number", control: "auto", compute: fromEmployee("employment_number") },
          { name: "employer", label: "expenses.leave.company", control: "auto", compute: fromEmployee("employer") },
          { name: "position", label: "expenses.leave.position", control: "auto", compute: fromEmployee("job_title") },
          { name: "department", label: "expenses.leave.department", control: "auto", compute: fromEmployee("department") },
          { name: "plan_year", label: "expenses.leave.plan.year", control: "year", required: true, from: 2020 },
        ],
      },
      {
        title: "expenses.leave.plan.rows",
        fields: [
          {
            name: "rows",
            label: "expenses.leave.plan.rows",
            control: "rows",
            childTable: "leave_plan_rows",
            fk: "leave_plan_id",
            fields: [
              { name: "date_from", label: "expenses.leave.date_from", control: "date", required: true },
              { name: "date_to", label: "expenses.leave.date_to", control: "date", required: true },
              { name: "days", label: "expenses.leave.days", control: "auto", format: "number", digits: 0, compute: (r) => (r.date_from && r.date_to ? Math.round((new Date(r.date_to as string).getTime() - new Date(r.date_from as string).getTime()) / 86400000) + 1 : null) },
              { name: "category_id", label: "expenses.leave.category", control: "select", source: "leave_categories" },
              { name: "notes", label: "common.notes", control: "text" },
            ],
            totals: [{ label: "expenses.leave.total_days", format: "number", compute: (rows) => rows.reduce((s, r) => s + (r.date_from && r.date_to ? Math.round((new Date(r.date_to as string).getTime() - new Date(r.date_from as string).getTime()) / 86400000) + 1 : 0), 0) }],
          },
        ],
      },
    ],
  },
  list: {
    select: "*",
    orderBy: { column: "plan_year", ascending: false },
    searchKeys: ["employee_name", "department"],
    columns: [
      { key: "plan_year", header: "expenses.leave.plan.year", type: "number", digits: 0 },
      { key: "employee_name", header: "expenses.leave.name" },
      { key: "employment_number", header: "expenses.leave.employment_number" },
      { key: "department", header: "expenses.leave.department" },
    ],
  },
};

export const leaveRequests: ModuleDef = {
  key: "expenses.leave.requests",
  path: "/expenses/leave/requests",
  resource: "expenses.leave.requests",
  table: "leave_requests",
  title: "expenses.leave.requests.title",
  description: "expenses.leave.requests.description",
  newLabel: "expenses.leave.requests.new",
  exportName: "leave-requests",
  optionSources: ["profiles", "leave_categories", "drivers"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  detailExtra: "leave_balance",
  titleOf: (r) => `${(r.employee as { full_name?: string } | undefined)?.full_name ?? ""} ${r.date_from ?? ""}`.trim(),
  approvalExtra: () => [
    { name: "approver_name", label: "approval.approver_name", control: "text", required: true },
    { name: "approver_position", label: "approval.approver_position", control: "text", required: true },
  ],
  schema: {
    table: "leave_requests",
    resource: "expenses.leave.requests",
    isRequest: true,
    sections: [
      {
        fields: [
          { name: "employee_id", label: "expenses.leave.name", control: "select", source: "profiles", description: "expenses.employee_hint" },
          { name: "category_id", label: "expenses.leave.category", control: "select", source: "leave_categories", required: true },
          { name: "date_from", label: "expenses.leave.date_from", control: "date", required: true },
          { name: "date_to", label: "expenses.leave.date_to", control: "date", required: true },
          { name: "total_days", label: "expenses.leave.total_days", control: "auto", format: "number", digits: 0, compute: (v) => (v.date_from && v.date_to ? Math.round((new Date(v.date_to as string).getTime() - new Date(v.date_from as string).getTime()) / 86400000) + 1 : null) },
          { name: "reason", label: "expenses.leave.reason", control: "textarea" },
        ],
      },
    ],
  },
  list: {
    select: "*, employee:profiles(full_name), category:leave_categories(name)",
    orderBy: { column: "date_from", ascending: false },
    searchKeys: ["employee.full_name", "category.name", "status"],
    statusColumn: "status",
    columns: [
      { key: "employee.full_name", header: "expenses.leave.name" },
      { key: "category.name", header: "expenses.leave.category" },
      { key: "date_from", header: "expenses.leave.date_from", type: "date" },
      { key: "date_to", header: "expenses.leave.date_to", type: "date" },
      { key: "total_days", header: "expenses.leave.total_days", type: "number", digits: 0 },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

export const leaveBalances: ModuleDef = {
  key: "expenses.leave.balances",
  path: "/expenses/leave/balances",
  resource: "expenses.leave.balances",
  table: "leave_balances",
  title: "expenses.leave.balances.title",
  description: "expenses.leave.balances.description",
  newLabel: "expenses.leave.balances.new",
  exportName: "leave-balances",
  optionSources: ["profiles"],
  listExtra: "leave_balance_view",
  titleOf: (r) => `${(r.employee as { full_name?: string } | undefined)?.full_name ?? ""} ${r.balance_year ?? ""}`.trim(),
  schema: {
    table: "leave_balances",
    resource: "expenses.leave.balances",
    sections: [
      {
        fields: [
          { name: "employee_id", label: "expenses.leave.name", control: "select", source: "profiles", required: true },
          { name: "balance_year", label: "expenses.leave.year", control: "year", required: true, from: 2020 },
          { name: "entitled_days", label: "expenses.leave.entitled", control: "number", min: 0, step: 0.5, required: true },
          { name: "carried_over_days", label: "expenses.leave.carried_over", control: "number", min: 0, step: 0.5 },
        ],
      },
    ],
  },
  list: {
    select: "*, employee:profiles(full_name)",
    orderBy: { column: "balance_year", ascending: false },
    searchKeys: ["employee.full_name"],
    columns: [
      { key: "balance_year", header: "expenses.leave.year", type: "number", digits: 0 },
      { key: "employee.full_name", header: "expenses.leave.name" },
      { key: "entitled_days", header: "expenses.leave.entitled", type: "number", digits: 1 },
      { key: "carried_over_days", header: "expenses.leave.carried_over", type: "number", digits: 1 },
    ],
  },
};

const SEX: Option[] = [
  { value: "male", label: "drivers.sex.male" },
  { value: "female", label: "drivers.sex.female" },
];

const personRows = (name: string, label: string): Field => ({
  name,
  label,
  control: "rows",
  childTable: "incident_people",
  fk: "incident_id",
  childFilter: { kind: name === "injured" ? "injured" : "deceased" },
  fields: [
    { name: "name", label: "expenses.safety.person_name", control: "text", required: true },
    { name: "sex", label: "expenses.safety.person_sex", control: "radio", inline: true, options: SEX },
    { name: "age", label: "expenses.safety.person_age", control: "number", min: 0, max: 120, integer: true },
    { name: "contact", label: "expenses.safety.person_contact", control: "tel" },
    { name: "address", label: "expenses.safety.person_address", control: "text" },
  ],
  defaultRow: () => ({ name: "", sex: "", age: "", contact: "", address: "" }),
});

export const incidents: ModuleDef = {
  key: "expenses.safety.incidents",
  path: "/expenses/safety/incidents",
  resource: "expenses.safety.incidents",
  table: "incidents",
  title: "expenses.safety.incidents.title",
  description: "expenses.safety.incidents.description",
  newLabel: "expenses.safety.incidents.new",
  exportName: "incidents",
  optionSources: ["vehicles", "drivers"],
  titleOf: (r) => `${r.occurred_at ? String(r.occurred_at).slice(0, 10) : ""} ${r.region ?? ""}`.trim(),
  schema: {
    table: "incidents",
    resource: "expenses.safety.incidents",
    sections: [
      {
        fields: [
          { name: "occurred_at", label: "expenses.safety.occurred_at", control: "datetime", required: true },
          {
            name: "status",
            label: "expenses.safety.status",
            control: "select",
            options: [
              { value: "open", label: "status.open" },
              { value: "under_review", label: "status.under_review" },
              { value: "closed", label: "status.closed" },
            ],
            required: true,
          },
          { name: "region", label: "expenses.safety.region", control: "select", options: TZ_REGIONS.map((r) => ({ value: r, label: r })), required: true },
          { name: "district", label: "expenses.safety.district", control: "text", required: true },
          { name: "ward", label: "expenses.safety.ward", control: "text" },
          { name: "village_street", label: "expenses.safety.village_street", control: "text" },
          { name: "road_name", label: "expenses.safety.road_name", control: "text" },
          { name: "description", label: "expenses.safety.description", control: "textarea", required: true },
        ],
      },
      {
        title: "expenses.safety.vehicles",
        description: "expenses.safety.vehicles_hint",
        collapsible: true,
        fields: [
          {
            name: "vehicles",
            label: "expenses.safety.vehicles",
            control: "rows",
            childTable: "incident_vehicles",
            fk: "incident_id",
            fields: [
              { name: "vehicle_source", label: "expenses.safety.vehicle_source", control: "radio", inline: true, required: true, options: [
              { value: "fleet", label: "expenses.safety.source.fleet" },
              { value: "other", label: "expenses.safety.source.other" },
            ] },
              { name: "vehicle_id", label: "expenses.safety.vehicle", control: "select", source: "vehicles", required: true, showWhen: { field: "vehicle_source", equals: "fleet" }, description: "expenses.safety.fleet_vehicle_hint" },
              { name: "registration", label: "expenses.safety.vehicle_registration", control: "text", required: true, showWhen: { field: "vehicle_source", equals: "other" } },
              { name: "make", label: "expenses.safety.vehicle_make", control: "text", showWhen: { field: "vehicle_source", equals: "other" } },
              { name: "model", label: "expenses.safety.vehicle_model", control: "text", showWhen: { field: "vehicle_source", equals: "other" } },
              { name: "yom", label: "expenses.safety.vehicle_yom", control: "year", from: 1980, showWhen: { field: "vehicle_source", equals: "other" } },
              { name: "owner_name", label: "expenses.safety.vehicle_owner", control: "text", showWhen: { field: "vehicle_source", equals: "other" } },
              { name: "insurance_policy_number", label: "expenses.safety.vehicle_policy", control: "text", showWhen: { field: "vehicle_source", equals: "other" } },
              { name: "driver_name", label: "expenses.safety.other_driver_name", control: "text", showWhen: { field: "vehicle_source", equals: "other" } },
              { name: "driver_contact", label: "expenses.safety.other_driver_contact", control: "tel", showWhen: { field: "vehicle_source", equals: "other" } },
              { name: "driver_licence_number", label: "expenses.safety.driver_licence_number", control: "text", showWhen: { field: "vehicle_source", equals: "other" } },
            ],
            defaultRow: () => ({ vehicle_source: "fleet", vehicle_id: "", registration: "", make: "", model: "", yom: "", owner_name: "", insurance_policy_number: "", driver_name: "", driver_contact: "", driver_licence_number: "" }),
          },
        ],
      },
      {
        title: "expenses.safety.driver",
        collapsible: true,
        fields: [
          { name: "driver_source", label: "expenses.safety.driver_source", control: "radio", inline: true, required: true, options: [
              { value: "fleet", label: "expenses.safety.driver_source.fleet" },
              { value: "other", label: "expenses.safety.driver_source.other" },
            ] },
          { name: "driver_id", label: "expenses.safety.driver", control: "select", source: "drivers", required: true, showWhen: { field: "driver_source", equals: "fleet" }, description: "expenses.safety.fleet_driver_hint" },
          { name: "driver_name", label: "expenses.safety.driver_name", control: "text", required: true, showWhen: { field: "driver_source", equals: "other" } },
          { name: "driver_company", label: "expenses.safety.driver_company", control: "text", showWhen: { field: "driver_source", equals: "other" } },
          { name: "driver_contact", label: "expenses.safety.driver_contact", control: "tel", showWhen: { field: "driver_source", equals: "other" } },
          { name: "driver_age", label: "expenses.safety.driver_age", control: "number", min: 0, max: 120, integer: true, showWhen: { field: "driver_source", equals: "other" } },
          { name: "driver_sex", label: "expenses.safety.driver_sex", control: "radio", inline: true, options: SEX, showWhen: { field: "driver_source", equals: "other" } },
          { name: "driver_licence_class", label: "expenses.safety.driver_licence_class", control: "text", showWhen: { field: "driver_source", equals: "other" } },
          { name: "driver_licence_number", label: "expenses.safety.driver_licence_number", control: "text", showWhen: { field: "driver_source", equals: "other" } },
          { name: "driver_years_driving", label: "expenses.safety.driver_years", control: "number", min: 0, integer: true, showWhen: { field: "driver_source", equals: "other" } },
        ],
      },
      {
        title: "expenses.safety.injuries",
        collapsible: true,
        fields: [
          { name: "injuries_count", label: "expenses.safety.injuries_count", control: "auto", format: "number", digits: 0, compute: (v) => (Array.isArray(v.injured) ? v.injured.length : 0) },
          personRows("injured", "expenses.safety.injuries"),
        ],
      },
      {
        title: "expenses.safety.fatalities",
        collapsible: true,
        fields: [
          { name: "fatalities_count", label: "expenses.safety.fatalities_count", control: "auto", format: "number", digits: 0, compute: (v) => (Array.isArray(v.deceased) ? v.deceased.length : 0) },
          personRows("deceased", "expenses.safety.fatalities"),
        ],
      },
      {
        title: "expenses.safety.response",
        collapsible: true,
        fields: [
          { name: "other_actions", label: "expenses.safety.response", control: "textarea", placeholder: "expenses.safety.response_placeholder", colSpan: 2 },
        ],
      },
      {
        title: "common.documents",
        description: "common.documents_hint",
        collapsible: true,
        fields: [{ name: "files", label: "common.attachments", control: "file", bucket: "incident-files", labels: ["expenses.safety.doc.police_report", "expenses.safety.doc.photos", "expenses.safety.doc.insurance_claim"] }],
      },
    ],
  },
  list: {
    select: "*",
    orderBy: { column: "occurred_at", ascending: false },
    searchKeys: ["region", "district", "road_name", "driver_name", "description", "status"],
    statusColumn: "status",
    columns: [
      { key: "occurred_at", header: "expenses.safety.occurred_at", type: "datetime" },
      { key: "region", header: "expenses.safety.region" },
      { key: "district", header: "expenses.safety.district" },
      { key: "road_name", header: "expenses.safety.road_name" },
      { key: "driver_name", header: "expenses.safety.driver" },
      { key: "injuries_count", header: "expenses.safety.injuries", type: "number", digits: 0 },
      { key: "fatalities_count", header: "expenses.safety.fatalities", type: "number", digits: 0 },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};
