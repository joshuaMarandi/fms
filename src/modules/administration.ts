import type { ColumnSpec, ModuleDef } from "./types";
import type { Field, Option } from "@/lib/forms/schema";

/** Fleet administration: roster, outstation allowance and petty cash (timesheet and leave live in expenses.ts). */

const SHIFTS: Option[] = ["day", "night", "standby", "off"].map((k) => ({ value: k, label: `admin.roster.shift.${k}` }));

export const fleetRoster: ModuleDef = {
  key: "expenses.admin.roster",
  path: "/administration/roster",
  resource: "expenses.admin.roster",
  table: "fleet_rosters",
  title: "admin.roster.title",
  description: "admin.roster.description",
  newLabel: "admin.roster.new",
  exportName: "fleet-roster",
  optionSources: ["vehicles", "drivers", "sites"],
  titleOf: (r) => `${(r.driver as { full_name?: string } | undefined)?.full_name ?? ""} ${r.roster_date ?? ""}`.trim(),
  schema: {
    table: "fleet_rosters",
    resource: "expenses.admin.roster",
    sections: [
      {
        fields: [
          { name: "roster_date", label: "common.date", control: "date", required: true },
          { name: "shift", label: "admin.roster.shift", control: "radio", inline: true, required: true, options: SHIFTS },
          { name: "driver_id", label: "inspections.driver", control: "select", source: "drivers", required: true },
          { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles" },
          { name: "site_id", label: "fleet.site", control: "select", source: "sites" },
          { name: "time_from", label: "daily_use.trips.time_from", control: "time" },
          { name: "time_to", label: "daily_use.trips.time_to", control: "time" },
          { name: "notes", label: "common.notes", control: "textarea" },
        ],
      },
    ],
  },
  list: {
    select: "*, driver:drivers(full_name), vehicle:vehicles(registration), site:sites(name)",
    orderBy: { column: "roster_date", ascending: false },
    searchKeys: ["driver.full_name", "vehicle.registration", "site.name"],
    statusColumn: "shift",
    columns: [
      { key: "roster_date", header: "common.date", type: "date" },
      { key: "shift", header: "admin.roster.shift", type: "label", options: SHIFTS },
      { key: "driver.full_name", header: "inspections.driver" },
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "site.name", header: "fleet.site" },
      { key: "time_from", header: "daily_use.trips.time_from", type: "time" },
      { key: "time_to", header: "daily_use.trips.time_to", type: "time" },
      { key: "notes", header: "common.notes", type: "multiline", sortable: false },
    ],
  },
};

/** Outstation allowance (company Excel format): allowance = total days x DSA, plus other expenses. */
export const outstationAllowances: ModuleDef = {
  key: "expenses.admin.outstation",
  path: "/administration/outstation",
  resource: "expenses.admin.outstation",
  table: "outstation_requests",
  title: "admin.outstation.title",
  description: "admin.outstation.description",
  newLabel: "admin.outstation.new",
  exportName: "outstation-allowance",
  optionSources: ["vehicles", "drivers"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  titleOf: (r) => `${(r.driver as { full_name?: string } | undefined)?.full_name ?? ""} ${r.location ?? ""}`.trim(),
  schema: {
    table: "outstation_requests",
    resource: "expenses.admin.outstation",
    isRequest: true,
    sections: [
      {
        title: "admin.outstation.allowance",
        fields: [
          { name: "date_from", label: "admin.outstation.date_from", control: "date", required: true },
          { name: "date_to", label: "admin.outstation.date_to", control: "date", required: true },
          { name: "return_date", label: "admin.outstation.return_date", control: "date" },
          { name: "description", label: "admin.outstation.description_field", control: "textarea" },
          { name: "driver_id", label: "inspections.driver", control: "select", source: "drivers", required: true },
          {
            name: "driver_phone",
            label: "admin.outstation.phone",
            control: "auto",
            format: "text",
            compute: (v, ctx) => ((ctx.options.drivers ?? []).find((d) => d.value === v.driver_id)?.phone as string) ?? "",
          },
          { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles" },
          { name: "location", label: "admin.outstation.location", control: "text", required: true },
          {
            name: "total_days",
            label: "admin.outstation.total_days",
            control: "number",
            min: 0,
            integer: true,
            required: true,
            prefill: {
              deps: ["date_from", "date_to"],
              compute: (v) => (v.date_from && v.date_to ? Math.max(0, Math.round((new Date(v.date_to as string).getTime() - new Date(v.date_from as string).getTime()) / 86400000) + 1) : undefined),
            },
          },
          { name: "dsa_tzs", label: "admin.outstation.dsa", control: "number", min: 0, unit: "TZS", required: true },
          {
            name: "allowance_tzs",
            label: "admin.outstation.total_1",
            control: "auto",
            format: "tzs",
            compute: (v) => (v.total_days === "" || v.total_days == null || v.dsa_tzs === "" || v.dsa_tzs == null ? null : Number(v.total_days) * Number(v.dsa_tzs)),
          },
        ],
      },
      {
        title: "admin.outstation.other_expenses",
        fields: [
          {
            name: "items",
            label: "admin.outstation.other_expenses",
            control: "rows",
            childTable: "outstation_expense_items",
            fk: "outstation_request_id",
            addLabel: "admin.outstation.add_item",
            fields: [
              { name: "description", label: "admin.outstation.item_description", control: "text", required: true },
              { name: "quantity", label: "expenses.misc.quantity", control: "number", min: 0, step: 0.01, required: true },
              { name: "unit", label: "expenses.misc.unit", control: "text" },
              { name: "unit_price_tzs", label: "expenses.misc.unit_price", control: "number", min: 0, unit: "TZS", required: true },
              { name: "amount_tzs", label: "expenses.misc.amount", control: "auto", format: "tzs", compute: (v) => (v.quantity === "" || v.unit_price_tzs === "" ? null : Number(v.quantity) * Number(v.unit_price_tzs)) },
            ],
            defaultRow: () => ({ description: "", quantity: 1, unit: "", unit_price_tzs: "" }),
            totals: [{ label: "admin.outstation.total_2", format: "tzs", compute: (rows) => rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price_tzs) || 0), 0) }],
          },
          {
            name: "total_cost",
            label: "admin.outstation.total_cost",
            control: "auto",
            format: "tzs",
            compute: (v) => {
              const allowance = (Number(v.total_days) || 0) * (Number(v.dsa_tzs) || 0);
              const other = (Array.isArray(v.items) ? (v.items as Record<string, unknown>[]) : []).reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price_tzs) || 0), 0);
              return allowance + other;
            },
          },
          { name: "confirmation", label: "admin.outstation.requester_signature", control: "signature", required: true },
        ],
      },
    ],
  },
  list: {
    select: "*, driver:drivers(full_name, phone), vehicle:vehicles(registration)",
    orderBy: { column: "date_from", ascending: false },
    searchKeys: ["driver.full_name", "location", "description", "status"],
    statusColumn: "status",
    columns: [
      { key: "date_from", header: "admin.outstation.date_from", type: "date" },
      { key: "date_to", header: "admin.outstation.date_to", type: "date" },
      { key: "return_date", header: "admin.outstation.return_date", type: "date" },
      { key: "description", header: "admin.outstation.description_field" },
      { key: "driver.full_name", header: "inspections.driver" },
      { key: "driver.phone", header: "admin.outstation.phone" },
      { key: "location", header: "admin.outstation.location" },
      { key: "total_days", header: "admin.outstation.total_days", type: "number" },
      { key: "dsa_tzs", header: "admin.outstation.dsa", type: "tzs" },
      { key: "allowance_tzs", header: "admin.outstation.amount", type: "tzs" },
      { key: "other_total_tzs", header: "admin.outstation.total_2", type: "tzs" },
      { key: "total_cost_tzs", header: "admin.outstation.total_cost", type: "tzs" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

const VERIFY: Option[] = [
  { value: "verified", label: "admin.petty_cash.verified" },
  { value: "not_verified", label: "admin.petty_cash.not_verified" },
];

/** Petty cash request and reconciliation (company Excel format). */
export const pettyCash: ModuleDef = {
  key: "expenses.admin.petty_cash",
  path: "/administration/petty-cash",
  resource: "expenses.admin.petty_cash",
  table: "petty_cash_requests",
  title: "admin.petty_cash.title",
  description: "admin.petty_cash.description",
  newLabel: "admin.petty_cash.new",
  exportName: "petty-cash",
  optionSources: [],
  isRequest: true,
  // After approval the cash received and the transactions are still recorded on the request.
  editableStatuses: ["draft", "rejected", "approved"],
  listExtra: "petty_cash_summary",
  titleOf: (r) => `${r.requester_name ?? ""} ${r.request_date ?? ""}`.trim(),
  schema: {
    table: "petty_cash_requests",
    resource: "expenses.admin.petty_cash",
    isRequest: true,
    sections: [
      {
        title: "admin.petty_cash.request",
        fields: [
          { name: "request_date", label: "common.date", control: "date", required: true },
          { name: "requester_name", label: "admin.petty_cash.requester", control: "auto", format: "text", compute: (v, ctx) => (v.requester_name as string) || ctx.session.fullName },
          { name: "position", label: "admin.petty_cash.position", control: "text", description: "admin.petty_cash.from_profile" },
          { name: "phone", label: "admin.petty_cash.phone", control: "tel", description: "admin.petty_cash.from_profile" },
          { name: "purpose", label: "admin.petty_cash.purpose", control: "textarea" },
          { name: "amount_requested_tzs", label: "admin.petty_cash.amount_requested", control: "number", min: 0, unit: "TZS", required: true },
          { name: "amount_received_tzs", label: "admin.petty_cash.amount_received", control: "number", min: 0, unit: "TZS", description: "admin.petty_cash.received_hint" },
          { name: "confirmation", label: "admin.petty_cash.requester_signature", control: "signature", required: true },
        ],
      },
      {
        title: "admin.petty_cash.transactions",
        description: "admin.petty_cash.transactions_hint",
        fields: [
          {
            name: "transactions",
            label: "admin.petty_cash.transactions",
            control: "rows",
            childTable: "petty_cash_transactions",
            fk: "petty_cash_request_id",
            addLabel: "admin.petty_cash.add_transaction",
            fields: [
              { name: "txn_date", label: "common.date", control: "date", required: true },
              { name: "description", label: "admin.petty_cash.description_field", control: "text", required: true },
              { name: "quantity", label: "expenses.misc.quantity", control: "number", min: 0, step: 0.01, required: true },
              { name: "unit", label: "expenses.misc.unit", control: "text" },
              { name: "price_tzs", label: "admin.petty_cash.price", control: "number", min: 0, unit: "TZS", required: true },
              { name: "amount_tzs", label: "expenses.misc.amount", control: "auto", format: "tzs", compute: (v) => (v.quantity === "" || v.price_tzs === "" ? null : Number(v.quantity) * Number(v.price_tzs)) },
              { name: "receipt_number", label: "admin.petty_cash.receipt", control: "text" },
              { name: "verification", label: "admin.petty_cash.status", control: "select", options: VERIFY, required: true },
              { name: "verified_by", label: "admin.petty_cash.verified_by", control: "text", showWhen: { field: "verification", equals: "verified" } },
            ],
            defaultRow: () => ({ txn_date: new Date().toISOString().slice(0, 10), description: "", quantity: 1, unit: "", price_tzs: "", receipt_number: "", verification: "not_verified", verified_by: "" }),
            totals: [{ label: "admin.petty_cash.amount_spent", format: "tzs", compute: (rows) => rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.price_tzs) || 0), 0) }],
          },
          { name: "receipts", label: "admin.petty_cash.receipts", control: "file", bucket: "forms", labels: ["admin.petty_cash.receipts"] },
        ],
      },
    ],
  },
  list: {
    select: "*",
    orderBy: { column: "request_date", ascending: false },
    searchKeys: ["requester_name", "position", "purpose", "status"],
    statusColumn: "status",
    columns: [
      { key: "request_date", header: "common.date", type: "date" },
      { key: "requester_name", header: "admin.petty_cash.requester" },
      { key: "position", header: "admin.petty_cash.position" },
      { key: "phone", header: "admin.petty_cash.phone" },
      { key: "amount_requested_tzs", header: "admin.petty_cash.amount_requested", type: "tzs" },
      { key: "amount_received_tzs", header: "admin.petty_cash.amount_received", type: "tzs" },
      { key: "amount_spent_tzs", header: "admin.petty_cash.amount_spent", type: "tzs" },
      { key: "balance_tzs", header: "admin.petty_cash.balance", type: "tzs" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

// ---------------------------------------------------------------- travel coordination

const travelFields = (direction: "departure" | "arrival"): Field[] => [
  { name: "direction", label: "common.record", control: "hidden" },
  { name: "travel_date", label: "common.date", control: "date", required: true },
  { name: "travellers", label: "travel.travellers", control: "textarea", required: true, description: "travel.travellers_hint" },
  { name: "airport", label: "travel.airport", control: "select", source: "travel_airports", required: true },
  { name: "flight", label: "travel.flight", control: "text" },
  { name: "flight_time", label: direction === "departure" ? "travel.departure_time" : "travel.arrival_time", control: "time", required: true },
  { name: "pickup_from", label: "travel.pickup_from", control: "text", required: direction === "departure" },
  {
    name: "pickup_time",
    label: "travel.pickup_time",
    control: "time",
    description: direction === "departure" ? "travel.pickup_rule_departure" : "travel.pickup_rule_arrival",
    // Departures: pick up the set number of hours before the flight (per airport). Arrivals: at landing.
    prefill: {
      deps: ["airport", "flight_time"],
      compute: (v, ctx) => {
        const time = String(v.flight_time ?? "");
        if (!/^\d{2}:\d{2}/.test(time)) return undefined;
        if (direction === "arrival") return time.slice(0, 5);
        const lead = Number((ctx.options.travel_airports ?? []).find((a) => a.value === v.airport)?.pickup_lead_hours ?? 3);
        const [h, m] = time.split(":").map(Number) as [number, number];
        const total = (((h * 60 + m - Math.round(lead * 60)) % 1440) + 1440) % 1440;
        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      },
    },
  },
  { name: "transport_to", label: "travel.transport_to", control: "text" },
  { name: "host", label: "travel.host", control: "text" },
  { name: "driver_id", label: "inspections.driver", control: "select", source: "drivers" },
  { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles" },
  { name: "notes", label: "common.notes", control: "textarea" },
];

const travelColumns = (direction: "departure" | "arrival"): ColumnSpec[] => [
  { key: "travel_date", header: "common.date", type: "date" },
  { key: "travellers", header: "travel.travellers", type: "multiline" },
  { key: "airport", header: "travel.airport" },
  { key: "flight", header: "travel.flight" },
  { key: "flight_time", header: direction === "departure" ? "travel.departure_time" : "travel.arrival_time", type: "time" },
  { key: "pickup_from", header: "travel.pickup_from" },
  { key: "pickup_time", header: "travel.pickup_time", type: "time" },
  { key: "transport_to", header: "travel.transport_to" },
  { key: "host", header: "travel.host" },
  { key: "driver.full_name", header: "inspections.driver" },
  { key: "driver.phone", header: "admin.outstation.phone" },
  { key: "vehicle_name", header: "inspections.vehicle" },
  { key: "vehicle.registration", header: "travel.reg" },
];

const travelModule = (direction: "departure" | "arrival"): ModuleDef => ({
  key: direction === "departure" ? "expenses.travel.departures" : "expenses.travel.arrivals",
  path: direction === "departure" ? "/travel/departures" : "/travel/arrivals",
  resource: "expenses.travel",
  table: "travel_movements",
  title: direction === "departure" ? "travel.departures.title" : "travel.arrivals.title",
  description: direction === "departure" ? "travel.departures.description" : "travel.arrivals.description",
  newLabel: direction === "departure" ? "travel.departures.new" : "travel.arrivals.new",
  exportName: direction === "departure" ? "local-departures" : "local-arrivals",
  optionSources: ["drivers", "vehicles", "travel_airports"],
  fixed: { direction },
  titleOf: (r) => `${r.travel_date ?? ""} ${r.flight ?? ""}`.trim(),
  schema: { table: "travel_movements", resource: "expenses.travel", sections: [{ fields: travelFields(direction) }] },
  list: {
    select: "*, driver:drivers(full_name, phone), vehicle:vehicles(make, model, registration)",
    eq: { direction },
    orderBy: { column: "travel_date", ascending: false },
    searchKeys: ["travellers", "airport", "flight", "driver.full_name"],
    derive: (r) => {
      const v = r.vehicle as { make?: string; model?: string } | null;
      return { vehicle_name: v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() : null };
    },
    columns: travelColumns(direction),
  },
});

export const travelDepartures = travelModule("departure");
export const travelArrivals = travelModule("arrival");

/** Pickup rules per airport: how long before a departing flight the driver picks travellers up. */
export const travelAirports: ModuleDef = {
  key: "expenses.travel.settings",
  path: "/travel/settings",
  resource: "expenses.travel",
  table: "travel_airports",
  title: "travel.settings.title",
  description: "travel.settings.description",
  newLabel: "travel.settings.new",
  exportName: "pickup-settings",
  optionSources: [],
  titleOf: (r) => String(r.name ?? ""),
  schema: {
    table: "travel_airports",
    resource: "expenses.travel",
    sections: [
      {
        fields: [
          { name: "name", label: "travel.airport", control: "text", required: true },
          { name: "pickup_lead_hours", label: "travel.lead_hours", control: "number", min: 0, step: 0.5, unit: "h", required: true, description: "travel.lead_hours_hint" },
          { name: "host_person", label: "travel.host", control: "text" },
        ],
      },
    ],
  },
  list: {
    select: "*",
    orderBy: { column: "name", ascending: true },
    searchKeys: ["name", "host_person"],
    columns: [
      { key: "name", header: "travel.airport" },
      { key: "pickup_lead_hours", header: "travel.lead_hours", type: "hours", digits: 1 },
      { key: "host_person", header: "travel.host" },
    ],
  },
};

/** Fleet expenses: anything bought for the fleet that has no page of its own. */
export const miscExpenses: ModuleDef = {
  key: "expenses.misc",
  path: "/expenses/misc",
  resource: "expenses.misc",
  table: "misc_expenses",
  title: "expenses.misc.title",
  description: "expenses.misc.description",
  newLabel: "expenses.misc.new",
  exportName: "miscellaneous-expenses",
  optionSources: ["vehicles"],
  titleOf: (r) => `${r.description ?? ""} ${r.expense_date ?? ""}`.trim(),
  schema: {
    table: "misc_expenses",
    resource: "expenses.misc",
    sections: [
      {
        fields: [
          { name: "expense_date", label: "common.date", control: "date", required: true },
          { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles" },
          { name: "description", label: "expenses.misc.description_field", control: "text", required: true, colSpan: 2 },
          { name: "quantity", label: "expenses.misc.quantity", control: "number", min: 0, step: 0.01, required: true },
          { name: "unit", label: "expenses.misc.unit", control: "text", placeholder: "expenses.misc.unit_placeholder" },
          { name: "unit_price_tzs", label: "expenses.misc.unit_price", control: "number", min: 0, unit: "TZS", required: true },
          {
            name: "amount_tzs",
            label: "expenses.misc.amount",
            control: "auto",
            format: "tzs",
            compute: (v) => (v.quantity === "" || v.quantity == null || v.unit_price_tzs === "" || v.unit_price_tzs == null ? null : Number(v.quantity) * Number(v.unit_price_tzs)),
          },
          { name: "supplier", label: "expenses.misc.supplier", control: "text" },
          { name: "notes", label: "common.notes", control: "textarea" },
          { name: "receipt", label: "expenses.misc.receipt", control: "file", bucket: "forms", labels: ["expenses.misc.receipt"] },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "expense_date", ascending: false },
    searchKeys: ["vehicle.registration", "description", "supplier"],
    columns: [
      { key: "expense_date", header: "common.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "description", header: "expenses.misc.description_field" },
      { key: "quantity", header: "expenses.misc.quantity", type: "number", digits: 2 },
      { key: "unit", header: "expenses.misc.unit" },
      { key: "unit_price_tzs", header: "expenses.misc.unit_price", type: "tzs" },
      { key: "amount_tzs", header: "expenses.misc.amount", type: "tzs" },
    ],
  },
};
