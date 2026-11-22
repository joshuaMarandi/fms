import type { ModuleDef } from "./types";
import type { Field, Option } from "@/lib/forms/schema";
import { MONTH_OPTIONS } from "@/lib/forms/schema";
import { toISODate } from "@/lib/utils";
import { SHIFT_TIMES, splitHours, type Shift } from "@/lib/timesheet-hours";

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
  // Filled from the fuel log (each fuel issued); nothing is added here.
  viewOnly: true,
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
    select: "*, vehicle:vehicles(registration, target_km_per_l)",
    orderBy: { column: "expense_date", ascending: false },
    searchKeys: ["vehicle.registration"],
    // Discrepancy: attained km/L against the target (the record's, else the vehicle's default).
    derive: (r) => {
      const target = r.target_km_per_l ?? (r.vehicle as { target_km_per_l?: number | null } | undefined)?.target_km_per_l ?? null;
      const attained = r.attained_km_per_l;
      return { discrepancy: target === null || target === undefined || attained === null || attained === undefined ? null : Math.round((Number(attained) - Number(target)) * 100) / 100 };
    },
    columns: [
      { key: "expense_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "km_start", header: "expenses.fuel.km_start", type: "km" },
      { key: "km_end", header: "expenses.fuel.km_end", type: "km" },
      { key: "km_run", header: "expenses.fuel.km_run", type: "km" },
      { key: "attained_km_per_l", header: "expenses.fuel.attained", type: "number", digits: 2 },
      { key: "discrepancy", header: "expenses.fuel.discrepancy", type: "discrepancy" },
      { key: "price_per_litre", header: "expenses.fuel.price", type: "tzs" },
      { key: "amount_tzs", header: "expenses.fuel.amount", type: "tzs" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Maintenance and repair, per vehicle and month: work orders, job cards, spare parts, invoices and
// purchase orders. Every record shows the vehicle's make and model and its latest odometer.
// ---------------------------------------------------------------------------
type VehicleCtx = { options: { vehicles?: Record<string, unknown>[] } };
const maintVehicle = (v: Record<string, unknown>, ctx: VehicleCtx) => (ctx.options.vehicles ?? []).find((o) => o.value === v.vehicle_id);
const maintVehicleFields: Field[] = [
  { ...vehicleField, label: "fleet.reg" },
  {
    name: "vehicle_make_model",
    label: "fleet.make_model",
    control: "auto",
    format: "text",
    compute: (v, ctx) => {
      const x = maintVehicle(v, ctx);
      return x ? `${x.make ?? ""} ${x.model ?? ""}`.trim() : null;
    },
  },
  { name: "vehicle_odometer", label: "maint.latest_odometer", control: "auto", format: "km", compute: (v, ctx) => (maintVehicle(v, ctx)?.odometer_km as number | null | undefined) ?? null },
];
const MAINT_TYPES: Option[] = [
  { value: "maintenance", label: "expenses.maintenance.work_type.maintenance" },
  { value: "repairs", label: "expenses.maintenance.work_type.repairs" },
];
const PAYMENT_STATUS: Option[] = [
  { value: "unpaid", label: "maint.payment.unpaid" },
  { value: "partly_paid", label: "maint.payment.partly_paid" },
  { value: "paid", label: "maint.payment.paid" },
];
const daysBetween = (a: unknown, b: unknown) => {
  if (!a || !b) return null;
  const d = Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
  return Number.isNaN(d) || d < 0 ? null : d;
};
const vehicleTitle = (r: Record<string, unknown>, date: unknown, ref?: unknown) =>
  [ref, (r.vehicle as { registration?: string } | undefined)?.registration, date].filter((x) => x !== null && x !== undefined && x !== "").join(" ");

/** Job card: the work carried out on a vehicle (preventive or corrective) and its labour cost. */
export const maintenanceCosts: ModuleDef = {
  key: "expenses.maintenance.costs",
  path: "/expenses/maintenance/costs",
  resource: "expenses.maintenance.costs",
  table: "maintenance_costs",
  title: "expenses.maintenance.costs.title",
  description: "expenses.maintenance.costs.description",
  newLabel: "maint.job_cards.new",
  exportName: "job-cards",
  optionSources: ["vehicles"],
  titleOf: (r) => vehicleTitle(r, r.cost_date),
  schema: {
    table: "maintenance_costs",
    resource: "expenses.maintenance.costs",
    sections: [
      {
        fields: [
          ...maintVehicleFields,
          { name: "cost_date", label: "common.date", control: "date", required: true },
          { name: "work_type", label: "maint.maintenance_type", control: "radio", required: true, inline: true, options: MAINT_TYPES },
          { name: "activities", label: "maint.work_carried_out", control: "textarea", required: true },
          { name: "cost_tzs", label: "maint.labour_cost", control: "number", min: 0, unit: "TZS", required: true },
          { name: "service_provider", label: "expenses.maintenance.provider", control: "text" },
        ],
      },
      {
        title: "maint.garage_stay",
        fields: [
          { name: "date_in", label: "maint.date_in", control: "date" },
          { name: "date_out", label: "maint.date_out", control: "date" },
          { name: "days_in_garage", label: "maint.days_in_garage", control: "auto", format: "number", digits: 0, compute: (v) => daysBetween(v.date_in, v.date_out) },
          { name: "km_in", label: "maint.km_in", control: "number", min: 0, unit: "km" },
          { name: "km_out", label: "maint.km_out", control: "number", min: 0, unit: "km" },
          { name: "km_in_garage", label: "maint.km_in_garage", control: "auto", format: "km", compute: (v) => safe(num(v.km_out) - num(v.km_in)) },
        ],
      },
      {
        title: "common.attachments",
        fields: [
          {
            name: "docs",
            label: "common.attachments",
            control: "file",
            bucket: "forms",
            labels: ["expenses.maintenance.doc.job_card", "expenses.maintenance.doc.ppm_checklist", "expenses.maintenance.doc.repair_estimate"],
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
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "work_type", header: "maint.maintenance_type", type: "label", options: MAINT_TYPES },
      { key: "activities", header: "maint.work_carried_out", type: "multiline" },
      { key: "cost_tzs", header: "maint.labour_cost", type: "tzs" },
    ],
  },
};

/** Work order: the job asked of a service provider, sent to them by email. */
export const maintenanceWorkOrders: ModuleDef = {
  key: "expenses.maintenance.work_orders",
  path: "/expenses/maintenance/costs/work-orders",
  landOn: "month",
  resource: "expenses.maintenance.costs",
  table: "maintenance_work_orders",
  title: "maint.work_orders.title",
  description: "maint.work_orders.description",
  newLabel: "maint.work_orders.new",
  exportName: "work-orders",
  optionSources: ["vehicles"],
  detailExtra: "work_order_email",
  titleOf: (r) => vehicleTitle(r, r.order_date, r.order_number),
  schema: {
    table: "maintenance_work_orders",
    resource: "expenses.maintenance.costs",
    omitOnSave: ["emailed_at", "emailed_to"],
    sections: [
      {
        fields: [
          ...maintVehicleFields,
          { name: "order_number", label: "maint.order_id", control: "text", description: "maint.order_id_hint" },
          { name: "order_date", label: "maint.order_date", control: "date", required: true },
          { name: "description", label: "maint.description", control: "textarea", required: true },
          { name: "service_provider", label: "expenses.maintenance.provider", control: "text", required: true },
          { name: "provider_email", label: "maint.work_orders.provider_email", control: "email", description: "maint.work_orders.provider_email_hint" },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "order_date", ascending: false },
    searchKeys: ["order_number", "vehicle.registration", "service_provider", "description"],
    columns: [
      { key: "order_number", header: "maint.order_id" },
      { key: "order_date", header: "maint.order_date", type: "date" },
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "description", header: "maint.description", type: "multiline" },
      { key: "service_provider", header: "expenses.maintenance.provider" },
      { key: "emailed_at", header: "maint.work_orders.emailed", type: "datetime" },
    ],
  },
};

/** Spare parts bought for a vehicle: parts times unit price. */
export const maintenanceSpareParts: ModuleDef = {
  key: "expenses.maintenance.spare_parts",
  path: "/expenses/maintenance/costs/spare-parts",
  landOn: "month",
  resource: "expenses.maintenance.costs",
  table: "maintenance_spare_parts",
  title: "maint.spare_parts.title",
  description: "maint.spare_parts.description",
  newLabel: "maint.spare_parts.new",
  exportName: "spare-parts",
  optionSources: ["vehicles"],
  titleOf: (r) => vehicleTitle(r, r.part_date, r.description),
  schema: {
    table: "maintenance_spare_parts",
    resource: "expenses.maintenance.costs",
    sections: [
      {
        fields: [
          ...maintVehicleFields,
          { name: "part_date", label: "common.date", control: "date", required: true },
          { name: "description", label: "maint.description", control: "text", required: true },
          { name: "quantity", label: "maint.parts", control: "number", min: 0.01, step: 0.01, required: true },
          { name: "unit_price_tzs", label: "maint.unit_price", control: "number", min: 0, unit: "TZS", required: true },
          { name: "cost_tzs", label: "maint.cost", control: "auto", format: "tzs", compute: (v) => safe(num(v.quantity) * num(v.unit_price_tzs)) },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "part_date", ascending: false },
    searchKeys: ["description", "vehicle.registration"],
    columns: [
      { key: "part_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "description", header: "maint.description" },
      { key: "quantity", header: "maint.parts", type: "number" },
      { key: "unit_price_tzs", header: "maint.unit_price", type: "tzs" },
      { key: "cost_tzs", header: "maint.cost", type: "tzs" },
    ],
  },
};

/** Invoice from the service provider: labour plus spare parts; approved by the fleet manager, then the HOD. */
export const maintenanceInvoices: ModuleDef = {
  key: "expenses.maintenance.invoices",
  path: "/expenses/maintenance/costs/invoices",
  landOn: "month",
  resource: "expenses.maintenance.costs",
  table: "maintenance_invoices",
  title: "maint.invoices.title",
  description: "maint.invoices.description",
  newLabel: "maint.invoices.new",
  exportName: "maintenance-invoices",
  optionSources: ["vehicles"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  titleOf: (r) => vehicleTitle(r, r.invoice_date, r.invoice_number),
  schema: {
    table: "maintenance_invoices",
    resource: "expenses.maintenance.costs",
    isRequest: true,
    sections: [
      {
        fields: [
          ...maintVehicleFields,
          { name: "invoice_number", label: "maint.invoice_id", control: "text", required: true },
          { name: "invoice_date", label: "common.date", control: "date", required: true },
          { name: "service_provider", label: "expenses.maintenance.provider", control: "text", required: true },
          { name: "labour_tzs", label: "maint.labour_charge", control: "number", min: 0, unit: "TZS", required: true },
          { name: "parts_tzs", label: "maint.parts_cost", control: "number", min: 0, unit: "TZS", required: true },
          { name: "amount_tzs", label: "maint.amount", control: "auto", format: "tzs", compute: (v) => safe((Number.isNaN(num(v.labour_tzs)) ? 0 : num(v.labour_tzs)) + (Number.isNaN(num(v.parts_tzs)) ? 0 : num(v.parts_tzs))) },
        ],
      },
      {
        title: "maint.doc.invoice",
        fields: [{ name: "invoice_doc", label: "maint.doc.invoice", control: "file", bucket: "forms", labels: ["maint.doc.invoice"] }],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "invoice_date", ascending: false },
    searchKeys: ["invoice_number", "vehicle.registration", "service_provider", "status"],
    statusColumn: "status",
    columns: [
      { key: "invoice_number", header: "maint.invoice_id" },
      { key: "invoice_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "service_provider", header: "expenses.maintenance.provider" },
      { key: "labour_tzs", header: "maint.labour_charge", type: "tzs" },
      { key: "parts_tzs", header: "maint.parts_cost", type: "tzs" },
      { key: "amount_tzs", header: "maint.amount", type: "tzs" },
      { key: "status", header: "maint.approval_status", type: "status" },
    ],
  },
};

/** Purchase order to a service provider, with its payment status. */
export const maintenancePurchaseOrders: ModuleDef = {
  key: "expenses.maintenance.purchase_orders",
  path: "/expenses/maintenance/costs/purchase-orders",
  landOn: "month",
  resource: "expenses.maintenance.costs",
  table: "maintenance_purchase_orders",
  title: "maint.purchase_orders.title",
  description: "maint.purchase_orders.description",
  newLabel: "maint.purchase_orders.new",
  exportName: "purchase-orders",
  optionSources: ["vehicles"],
  titleOf: (r) => vehicleTitle(r, r.po_date, r.po_number),
  schema: {
    table: "maintenance_purchase_orders",
    resource: "expenses.maintenance.costs",
    sections: [
      {
        fields: [
          ...maintVehicleFields,
          { name: "po_number", label: "maint.po_id", control: "text", description: "maint.po_id_hint" },
          { name: "service_provider", label: "expenses.maintenance.provider", control: "text", required: true },
          { name: "po_date", label: "maint.po_date", control: "date", required: true },
          { name: "amount_tzs", label: "maint.po_amount", control: "number", min: 0, unit: "TZS", required: true },
          { name: "payment_status", label: "maint.payment_status", control: "select", options: PAYMENT_STATUS, required: true },
        ],
      },
      {
        title: "maint.doc.purchase_order",
        fields: [{ name: "po_doc", label: "maint.doc.purchase_order", control: "file", bucket: "forms", labels: ["maint.doc.purchase_order"] }],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "po_date", ascending: false },
    searchKeys: ["po_number", "vehicle.registration", "service_provider", "payment_status"],
    columns: [
      { key: "po_number", header: "maint.po_id" },
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "service_provider", header: "expenses.maintenance.provider" },
      { key: "po_date", header: "maint.po_date", type: "date" },
      { key: "amount_tzs", header: "maint.po_amount", type: "tzs" },
      { key: "payment_status", header: "maint.payment_status", type: "label", options: PAYMENT_STATUS },
    ],
  },
};

export const tyreRequests: ModuleDef = {
  key: "expenses.tyres",
  path: "/expenses/tyres",
  landOn: "month",
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
  landOn: "month",
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
          // Some trainings never expire: tick N/A and no expiry date (or reminder) is kept.
          { name: "no_expiry", label: "expenses.trainings.no_expiry", control: "checkbox" },
          { name: "refresher_date", label: "expenses.trainings.refresher", control: "date", description: "Reminder", required: true, showWhen: { field: "no_expiry", truthy: false } },
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
    derive: (r) => ({ expiry: r.no_expiry ? "N/A" : r.refresher_date }),
    orderBy: { column: "date_completed", ascending: false },
    searchKeys: ["driver.full_name", "trainer"],
    columns: [
      { key: "driver.full_name", header: "inspections.driver_name" },
      { key: "courses", header: "expenses.trainings.courses", type: "tags", options: COURSES },
      { key: "date_completed", header: "expenses.trainings.date_completed", type: "date" },
      { key: "trainer", header: "expenses.trainings.trainer" },
      { key: "cost_tzs", header: "expenses.trainings.cost", type: "tzs" },
      { key: "expiry", header: "expenses.trainings.refresher", type: "reminder" },
    ],
  },
};

export const toolboxPlans: ModuleDef = {
  key: "expenses.trainings.toolbox",
  path: "/expenses/trainings/toolbox",
  landOn: "month",
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

const DAY_TYPES: Option[] = ["work", "rest", "leave", "public_holiday", "sick", "absent"].map((k) => ({ value: k, label: `expenses.timesheet.day_type.${k}` }));
const SHIFT_TYPES: Option[] = ["day", "noon", "night"].map((k) => ({ value: k, label: `expenses.timesheet.shift.${k}` }));

/** Hours worked on a day: time out - time in - break (a night shift runs past midnight). */
function workedHours(v: Record<string, unknown>): number | null {
  const mins = (x: unknown) => {
    const m = /^(\d{2}):(\d{2})/.exec(String(x ?? ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const inn = mins(v.time_in);
  const out = mins(v.time_out);
  if (inn === null || out === null) return null;
  let total = out - inn;
  if (total < 0) total += 1440;
  const bf = mins(v.break_from);
  const bt = mins(v.break_to);
  if (bf !== null && bt !== null) total -= bt >= bf ? bt - bf : bt - bf + 1440;
  return Math.max(0, Math.round((total / 60) * 100) / 100);
}

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
  // Recorded by the coordinator, approved by the fleet manager, then by the HOD. Sent by the fleet
  // manager, it is already approved by them and goes to the HOD.
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
          { name: "employee_id", label: "expenses.timesheet.employee", control: "select", source: "profiles", required: true, description: "expenses.timesheet.employee_hint" },
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
            addLabel: "expenses.timesheet.add_day",
            fk: "timesheet_id",
            minRows: 1,
            fields: [
              { name: "work_date", label: "expenses.timesheet.work_date", control: "date", required: true },
              {
                name: "weekday",
                label: "expenses.timesheet.day",
                control: "auto",
                format: "text",
                compute: (v) => (v.work_date ? new Date(`${v.work_date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" }) : ""),
              },
              { name: "day_type", label: "expenses.timesheet.day_type", control: "select", options: DAY_TYPES, required: true },
              { name: "shift", label: "expenses.timesheet.shift", control: "select", options: SHIFT_TYPES, required: true },
              { name: "time_in", label: "expenses.timesheet.time_in", control: "time" },
              { name: "break_from", label: "expenses.timesheet.break_from", control: "time" },
              { name: "break_to", label: "expenses.timesheet.break_to", control: "time" },
              { name: "time_out", label: "expenses.timesheet.time_out", control: "time" },
              { name: "total_hours", label: "expenses.timesheet.total_hours", control: "auto", format: "hours", compute: (v) => workedHours(v) },
              { name: "overtime_hours", label: "expenses.timesheet.normal_ot", control: "number", min: 0, max: 24, step: 0.25, unit: "h", description: "expenses.timesheet.normal_ot_hint" },
              { name: "special_overtime_hours", label: "expenses.timesheet.special_ot", control: "number", min: 0, max: 24, step: 0.25, unit: "h", description: "expenses.timesheet.special_ot_hint" },
              { name: "allowance_tzs", label: "expenses.timesheet.allowance", control: "number", min: 0, step: 100, unit: "TZS" },
            ],
            defaultRow: (values, rows) => {
              const last = rows[rows.length - 1]?.work_date as string | undefined;
              const base = last ? new Date(last + "T00:00:00") : values.period_month ? new Date((values.period_month as string) + "T00:00:00") : new Date();
              if (last) base.setDate(base.getDate() + 1);
              // The same shift as the day before (standard times: 8 hours with a one-hour rest).
              const shift = ((rows[rows.length - 1]?.shift as Shift | undefined) ?? "day") as Shift;
              return { work_date: toISODate(base), day_type: "work", shift, ...SHIFT_TIMES[shift] ?? SHIFT_TIMES.day, overtime_hours: "", special_overtime_hours: "", allowance_tzs: "" };
            },
            totals: [
              { label: "expenses.timesheet.total_hours_all", format: "number", compute: (rows) => rows.reduce((s, r) => s + (workedHours(r) ?? 0), 0) },
              { label: "expenses.timesheet.day_time", format: "number", compute: (rows) => rows.reduce((s, r) => s + splitHours(r).day, 0) },
              { label: "expenses.timesheet.night_time", format: "number", compute: (rows) => rows.reduce((s, r) => s + splitHours(r).night, 0) },
              { label: "expenses.timesheet.normal_ot", format: "number", compute: (rows) => rows.reduce((s, r) => s + (Number(r.overtime_hours) || 0), 0) },
              { label: "expenses.timesheet.special_ot", format: "number", compute: (rows) => rows.reduce((s, r) => s + (Number(r.special_overtime_hours) || 0), 0) },
              { label: "expenses.timesheet.allowance", format: "number", compute: (rows) => rows.reduce((s, r) => s + (Number(r.allowance_tzs) || 0), 0) },
            ],
          },
        ],
      },
      {
        title: "expenses.timesheet.signatures",
        fields: [
          // The employee signs on the coordinator's device: their own signature, not the coordinator's.
          {
            name: "employee_signature",
            label: "expenses.timesheet.driver_signature",
            control: "signature",
            required: true,
            signer: (v, ctx) => ((ctx.options.profiles ?? []).find((o) => o.value === v.employee_id)?.label as string | undefined) ?? null,
          },
          // The person who records the timesheet (the coordinator), filled in by the system.
          { name: "coordinator_name", label: "expenses.timesheet.recorded_by", control: "auto", format: "text", compute: (v, ctx) => (v.coordinator_name as string) || ctx.session.fullName },
          { name: "coordinator_signature", label: "expenses.timesheet.coordinator_signature", control: "signature", required: true },
        ],
      },
    ],
  },
  list: {
    select: "*, days:timesheet_days(day_type, shift, time_in, time_out, break_from, break_to, total_hours, overtime_hours, special_overtime_hours, deleted_at)",
    orderBy: { column: "period_month", ascending: false },
    searchKeys: ["employee_name", "employment_number", "job_title", "status"],
    statusColumn: "status",
    // The Excel summary: days and hours of the month for each employee.
    derive: (r) => {
      const days = ((r.days as { day_type: string; shift: string; time_in: string | null; time_out: string | null; break_from: string | null; break_to: string | null; total_hours: number; overtime_hours: number; special_overtime_hours: number; deleted_at: string | null }[] | null) ?? []).filter((d) => !d.deleted_at);
      const hrs = (d: { total_hours: number }) => Number(d.total_hours) || 0;
      return {
        period_label: r.period_month ? new Date(`${r.period_month}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "",
        normal_days: days.filter((d) => d.day_type === "work" && hrs(d) > 0).length,
        holiday_days: days.filter((d) => d.day_type === "public_holiday" && hrs(d) > 0).length,
        normal_ot: days.reduce((s, d) => s + (Number(d.overtime_hours) || 0), 0),
        holiday_ot: days.reduce((s, d) => s + (Number(d.special_overtime_hours) || 0), 0),
        night_hours: days.reduce((s, d) => s + splitHours(d).night, 0),
        off_day_hours: days.filter((d) => d.day_type === "rest").reduce((s, d) => s + hrs(d), 0),
      };
    },
    columns: [
      { key: "period_label", header: "expenses.timesheet.period" },
      { key: "employee_name", header: "expenses.timesheet.employee_name" },
      { key: "employment_number", header: "expenses.timesheet.employment_number" },
      { key: "job_title", header: "expenses.timesheet.position" },
      { key: "normal_days", header: "expenses.timesheet.normal_days", type: "number" },
      { key: "holiday_days", header: "expenses.timesheet.holiday_days", type: "number" },
      { key: "normal_ot", header: "expenses.timesheet.normal_ot", type: "hours" },
      { key: "holiday_ot", header: "expenses.timesheet.holiday_ot", type: "hours" },
      { key: "night_hours", header: "expenses.timesheet.night_hours", type: "hours" },
      { key: "off_day_hours", header: "expenses.timesheet.off_day_hours", type: "hours" },
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
        // Leave plans are recorded, not approved. Days can be changed at any time.
        title: "expenses.leave.plan.days_title",
        description: "expenses.leave.plan.days_description",
        fields: [
          {
            name: "entitled_days",
            label: "expenses.leave.plan.entitled",
            control: "number",
            min: 0,
            max: 366,
            step: 0.5,
            unit: "days",
            required: true,
            prefill: { deps: ["employee_id", "plan_year"], compute: (v) => (v.entitled_days === "" || v.entitled_days == null ? 28 : undefined) },
          },
          {
            name: "carried_forward_days",
            label: "expenses.leave.plan.carried_forward",
            control: "number",
            min: 0,
            max: 366,
            step: 0.5,
            unit: "days",
            required: true,
            description: "expenses.leave.plan.carried_forward_hint",
            prefill: { deps: ["employee_id", "plan_year"], compute: (v) => (v.carried_forward_days === "" || v.carried_forward_days == null ? 0 : undefined) },
          },
          {
            name: "total_available",
            label: "expenses.leave.plan.total_available",
            control: "auto",
            format: "number",
            digits: 1,
            compute: (v) => (v.entitled_days === "" && v.carried_forward_days === "" ? null : (Number(v.entitled_days) || 0) + (Number(v.carried_forward_days) || 0)),
          },
        ],
      },
      {
        title: "expenses.leave.plan.months_title",
        description: "expenses.leave.plan.months_description",
        fields: [{ name: "planned_months", label: "expenses.leave.plan.planned_months", control: "checkbox_group", options: MONTH_OPTIONS, columns: 3 }],
      },
      {
        title: "expenses.leave.plan.rows",
        fields: [
          {
            name: "rows",
            label: "expenses.leave.plan.rows",
            control: "rows",
            childTable: "leave_plan_rows",
            addLabel: "expenses.leave.plan.add_period",
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
    searchKeys: ["employee_name", "employment_number"],
    columns: [
      { key: "plan_year", header: "expenses.leave.plan.year", type: "number", digits: 0 },
      { key: "employee_name", header: "expenses.leave.name" },
      { key: "employment_number", header: "expenses.leave.employment_number" },
      { key: "planned_months", header: "expenses.leave.plan.planned_months", type: "tags", options: MONTH_OPTIONS },
    ],
  },
};

export const leaveRequests: ModuleDef = {
  key: "expenses.leave.requests",
  path: "/expenses/leave/requests",
  landOn: "month",
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
  addLabel: name === "injured" ? "expenses.safety.add_injured" : "expenses.safety.add_deceased",
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
  landOn: "month",
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
            addLabel: "expenses.safety.add_vehicle",
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

/** Fleet expenses > Maintenance cost and Repair cost: the maintenance and repair records of one kind. */
const costsOf = (kind: "maintenance" | "repairs"): ModuleDef => ({
  ...maintenanceCosts,
  key: kind === "maintenance" ? "expenses.maintenance.costs.maintenance" : "expenses.maintenance.costs.repairs",
  path: kind === "maintenance" ? "/expenses/maintenance-cost" : "/expenses/repair-cost",
  // Recorded in Maintenance and repair cost; this page only shows its part.
  viewOnly: true,
  recordPath: "/expenses/maintenance/costs",
  title: kind === "maintenance" ? "expenses.maintenance_cost.title" : "expenses.repair_cost.title",
  description: kind === "maintenance" ? "expenses.maintenance_cost.description" : "expenses.repair_cost.description",
  exportName: kind === "maintenance" ? "maintenance-cost" : "repair-cost",
  fixed: { work_type: kind },
  list: {
    ...maintenanceCosts.list,
    eq: { work_type: kind },
    columns: maintenanceCosts.list.columns.filter((c) => c.key !== "work_type"),
  },
});
export const maintenanceCostOnly = costsOf("maintenance");
export const repairCostOnly = costsOf("repairs");
