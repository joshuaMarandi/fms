import type { ModuleDef } from "./types";
import type { Field } from "@/lib/forms/schema";

const num = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));

export const kmLogs: ModuleDef = {
  key: "daily_use.km_log",
  path: "/daily-use/km-log",
  resource: "daily_use.km_log",
  table: "km_logs",
  title: "daily_use.km_log.title",
  description: "daily_use.km_log.description",
  newLabel: "daily_use.km_log.new",
  exportName: "km-logs",
  optionSources: ["vehicles", "drivers"],
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.log_date ?? ""}`.trim(),
  schema: {
    table: "km_logs",
    resource: "daily_use.km_log",
    sections: [
      {
        fields: [
          { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles", required: true },
          { name: "driver_id", label: "inspections.driver_name", control: "select", source: "drivers", description: "Auto: the current driver when left empty" },
          { name: "log_date", label: "common.date", control: "date", required: true },
          {
            name: "trips",
            label: "daily_use.km_log.trips",
            control: "rows",
            childTable: "km_log_trips",
            fk: "km_log_id",
            minRows: 1,
            fields: [
              { name: "departing_location", label: "daily_use.km_log.departing", control: "text", required: true },
              { name: "departure_time", label: "daily_use.km_log.departure_time", control: "time" },
              { name: "km_start", label: "daily_use.km_log.km_start", control: "number", min: 0, unit: "km", required: true },
              { name: "km_end", label: "daily_use.km_log.km_end", control: "number", min: 0, unit: "km", required: true },
              { name: "destination", label: "daily_use.km_log.destination", control: "text", required: true },
              { name: "arrival_time", label: "daily_use.km_log.arrival_time", control: "time" },
              { name: "trip_km", label: "daily_use.km_log.trip_km", control: "auto", format: "km", compute: (row) => (Number.isNaN(num(row.km_end) - num(row.km_start)) ? null : num(row.km_end) - num(row.km_start)) },
            ],
            defaultRow: (values, rows) => {
              const last = rows[rows.length - 1];
              return { departing_location: (last?.destination as string) ?? "", departure_time: "", km_start: last ? last.km_end : "", km_end: "", destination: "", arrival_time: "" };
            },
            totals: [
              { label: "daily_use.km_log.total_km", format: "number", compute: (rows) => rows.reduce((s, r) => s + (Number.isNaN(num(r.km_end) - num(r.km_start)) ? 0 : num(r.km_end) - num(r.km_start)), 0) },
              { label: "daily_use.km_log.trip_count", format: "number", compute: (rows) => rows.length },
            ],
          },
          { name: "passenger_signature", label: "daily_use.km_log.passenger_signature", control: "signature" },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration), driver:drivers(full_name)",
    orderBy: { column: "log_date", ascending: false },
    searchKeys: ["vehicle.registration", "driver.full_name"],
    columns: [
      { key: "log_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "driver.full_name", header: "inspections.driver_name" },
      { key: "trip_count", header: "daily_use.km_log.trip_count", type: "number", digits: 0 },
      { key: "total_km", header: "daily_use.km_log.total_km", type: "km" },
    ],
  },
};

const fuelDriverFields: Field[] = [
  { name: "driver_id", label: "inspections.driver_name", control: "select", source: "drivers", description: "Auto: the current driver when left empty" },
  { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles", required: true },
  {
    name: "tank_capacity",
    label: "daily_use.fuel.tank_capacity",
    control: "auto",
    format: "litres",
    compute: (values, ctx) => (ctx.options.vehicles ?? []).find((v) => v.value === values.vehicle_id)?.fuel_tank_capacity_l ?? null,
  },
  { name: "request_date", label: "daily_use.fuel.request_date", control: "date", required: true },
  { name: "previous_odometer", label: "daily_use.fuel.previous_odometer", control: "number", min: 0, unit: "km", description: "Prefilled from the vehicle when left empty" },
  { name: "current_odometer", label: "daily_use.fuel.current_odometer", control: "number", min: 0, unit: "km", required: true },
  { name: "fuel_filled_l", label: "daily_use.fuel.fuel_filled", control: "number", min: 0, unit: "L" },
  { name: "fuel_required_l", label: "daily_use.fuel.fuel_required", control: "number", min: 0, unit: "L", required: true },
  { name: "confirmation", label: "daily_use.fuel.confirmation", control: "signature", required: true },
];

export const fuelLog: ModuleDef = {
  key: "daily_use.fuel_log",
  path: "/daily-use/fuel-log",
  resource: "daily_use.fuel_log",
  table: "fuel_requests",
  title: "daily_use.fuel.title",
  description: "daily_use.fuel.description",
  newLabel: "daily_use.fuel.new",
  exportName: "fuel-requests",
  optionSources: ["vehicles", "drivers"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  detailExtra: "fuel_issue",
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.request_date ?? ""}`.trim(),
  approvalExtra: (_o, record) => [{ name: "approved_l", label: "approval.approved_litres", control: "number", required: true, defaultValue: (record.fuel_required_l as number) ?? "" }],
  schema: {
    table: "fuel_requests",
    resource: "daily_use.fuel_log",
    isRequest: true,
    sections: [{ title: "daily_use.fuel.driver_request", fields: fuelDriverFields }],
  },
  list: {
    select: "*, vehicle:vehicles(registration), driver:drivers(full_name)",
    orderBy: { column: "request_date", ascending: false },
    searchKeys: ["vehicle.registration", "driver.full_name", "status"],
    statusColumn: "status",
    columns: [
      { key: "request_date", header: "daily_use.fuel.request_date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "driver.full_name", header: "inspections.driver_name" },
      { key: "current_odometer", header: "daily_use.fuel.current_odometer", type: "km" },
      { key: "fuel_required_l", header: "daily_use.fuel.fuel_required", type: "litres" },
      { key: "approved_l", header: "daily_use.fuel.approved_litres", type: "litres" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

export const tripRequests: ModuleDef = {
  key: "daily_use.trip_requests",
  path: "/daily-use/trip-requests",
  resource: "daily_use.trip_requests",
  table: "vehicle_requests",
  title: "daily_use.trips.title",
  description: "daily_use.trips.description",
  newLabel: "daily_use.trips.new",
  exportName: "vehicle-requests",
  optionSources: ["vehicles", "drivers"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  detailExtra: "trip_assignment",
  titleOf: (r) => `${r.requester_name ?? ""}: ${r.destination ?? ""}`,
  approvalExtra: (options) => [
    { name: "driver_id", label: "approval.assigned_driver", control: "select", required: true, options: (options.drivers ?? []).map((d) => ({ value: d.value, label: `${d.label}${d.phone ? ` (${d.phone})` : ""}` })) },
    { name: "vehicle_id", label: "approval.assigned_vehicle", control: "select", required: true, options: (options.vehicles ?? []).filter((v) => v.status !== "out_of_service").map((v) => ({ value: v.value, label: v.label })) },
  ],
  schema: {
    table: "vehicle_requests",
    resource: "daily_use.trip_requests",
    isRequest: true,
    sections: [
      {
        fields: [
          {
            name: "trip_type",
            label: "daily_use.trips.type",
            control: "radio",
            required: true,
            inline: true,
            options: [
              { value: "short", label: "daily_use.trips.type.short" },
              { value: "long", label: "daily_use.trips.type.long" },
            ],
          },
          { name: "requester_name", label: "daily_use.trips.requester", control: "auto", compute: (v, ctx) => (v.requester_name as string) || ctx.session.fullName },
          { name: "requester_phone", label: "daily_use.trips.requester_phone", control: "tel", description: "Auto: your profile phone when left empty" },
          { name: "requested_at", label: "daily_use.trips.requested_at", control: "auto", format: "date", compute: (v) => (v.requested_at as string) ?? new Date().toISOString() },
          { name: "date_needed", label: "daily_use.trips.date_needed", control: "date", required: true, description: "For a long trip this is the date from" },
          { name: "date_to", label: "daily_use.trips.date_to", control: "date", required: true, showWhen: { field: "trip_type", equals: "long" } },
          { name: "time_from", label: "daily_use.trips.time_from", control: "time", required: true },
          { name: "time_to", label: "daily_use.trips.time_to", control: "time", required: true },
          {
            name: "purpose_type",
            label: "daily_use.trips.purpose_type",
            control: "radio",
            required: true,
            inline: true,
            options: [
              { value: "official", label: "daily_use.trips.purpose.official" },
              { value: "personal", label: "daily_use.trips.purpose.personal" },
            ],
          },
          { name: "purpose", label: "daily_use.trips.purpose", control: "textarea", required: true },
          { name: "departure_time", label: "daily_use.trips.departure_time", control: "time", required: true },
          { name: "duration_hours", label: "daily_use.trips.duration", control: "number", min: 0, step: 0.5, unit: "h", required: true },
          { name: "occupants", label: "daily_use.trips.occupants", control: "number", min: 1, integer: true, required: true },
          { name: "destination", label: "daily_use.trips.destination", control: "text", required: true },
          { name: "confirmation", label: "daily_use.trips.confirmation", control: "signature", required: true },
        ],
      },
    ],
  },
  list: {
    select: "*, assignment:vehicle_assignments(driver:drivers(full_name), vehicle:vehicles(registration))",
    orderBy: { column: "requested_at", ascending: false },
    searchKeys: ["requester_name", "destination", "status", "trip_type"],
    statusColumn: "status",
    columns: [
      { key: "requested_at", header: "daily_use.trips.requested_at", type: "datetime" },
      { key: "requester_name", header: "daily_use.trips.requester" },
      { key: "trip_type", header: "daily_use.trips.type", type: "label", options: [{ value: "short", label: "daily_use.trips.type.short" }, { value: "long", label: "daily_use.trips.type.long" }] },
      { key: "date_needed", header: "daily_use.trips.date_needed", type: "date" },
      { key: "destination", header: "daily_use.trips.destination" },
      { key: "occupants", header: "daily_use.trips.occupants", type: "number", digits: 0 },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};
