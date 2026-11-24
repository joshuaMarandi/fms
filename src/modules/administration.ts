import type { ColumnSpec, ModuleDef } from "./types";
import type { Field, Option } from "@/lib/forms/schema";
import { t } from "@/i18n";
import { pickupLeadHours, terminalOptions, TRANSPORT_MODES } from "@/lib/travel";

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
  landOn: "month",
  resource: "expenses.admin.outstation",
  table: "outstation_requests",
  title: "admin.outstation.title",
  description: "admin.outstation.description",
  newLabel: "admin.outstation.new",
  exportName: "outstation-allowance",
  optionSources: ["vehicles", "drivers"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  // Approved by the fleet manager, verified by the HOD, then emailed to finance.
  listExtra: "outstation_summary",
  detailExtra: "outstation_driver",
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
          // Recorded by finance from the payment email link, with the proof of payment.
          { name: "amount_paid_tzs", label: "admin.outstation.amount_paid", control: "auto", format: "tzs", compute: (v) => (v.amount_paid_tzs === "" || v.amount_paid_tzs == null ? null : Number(v.amount_paid_tzs)) },
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
      { key: "driver.full_name", header: "inspections.driver" },
      { key: "total_cost_tzs", header: "admin.outstation.total_cost", type: "tzs" },
      { key: "amount_paid_tzs", header: "admin.outstation.amount_paid", type: "tzs" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

/** Petty cash request and reconciliation (company Excel format). */
export const pettyCash: ModuleDef = {
  key: "expenses.admin.petty_cash",
  path: "/administration/petty-cash",
  landOn: "month",
  resource: "expenses.admin.petty_cash",
  table: "petty_cash_requests",
  title: "admin.petty_cash.title",
  description: "admin.petty_cash.description",
  newLabel: "admin.petty_cash.new",
  exportName: "petty-cash",
  optionSources: [],
  isRequest: true,
  // Verified by the fleet manager (the amount) and the HOD, then emailed to finance, who give the money
  // and upload the proof of payment from the email link; each spend is a transaction of its own.
  editableStatuses: ["draft", "rejected", "approved"],
  listExtra: "petty_cash_summary",
  // Under the decision: View all transactions (the totals, every spend, and Add transaction).
  sideExtra: "petty_cash_transactions",
  statusLabels: { approved: "status.verified" },
  approvalExtra: (_options, record) => [{ name: "amount_approved", label: t("admin.petty_cash.amount_approved"), control: "number", required: true, defaultValue: (record.amount_requested_tzs as number | null) ?? "" }],
  titleOf: (r) => `${r.requester_name ?? ""} ${r.request_date ?? ""}`.trim(),
  schema: {
    table: "petty_cash_requests",
    resource: "expenses.admin.petty_cash",
    isRequest: true,
    creatorEditsDraft: true,
    sections: [
      {
        title: "admin.petty_cash.request",
        fields: [
          { name: "request_date", label: "common.date", control: "date", required: true },
          { name: "requester_name", label: "admin.petty_cash.requester", control: "auto", format: "text", compute: (v, ctx) => (v.requester_name as string) || ctx.session.fullName },
          { name: "position", label: "admin.petty_cash.position", control: "text", description: "admin.petty_cash.from_profile" },
          { name: "purpose", label: "admin.petty_cash.purpose", control: "textarea" },
          { name: "amount_requested_tzs", label: "admin.petty_cash.amount_requested", control: "number", min: 0, unit: "TZS", required: true },
          { name: "confirmation", label: "admin.petty_cash.requester_signature", control: "signature", required: true },
        ],
      },
      {
        title: "admin.petty_cash.given_title",
        description: "admin.petty_cash.given_description",
        fields: [
          { name: "amount_received_tzs", label: "admin.petty_cash.amount_received", control: "number", min: 0, unit: "TZS", description: "admin.petty_cash.received_hint" },
          { name: "proof", label: "admin.petty_cash.doc.proof_of_payment", control: "file", bucket: "forms", labels: ["admin.petty_cash.doc.proof_of_payment"] },
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
      { key: "amount_requested_tzs", header: "admin.petty_cash.amount_requested", type: "tzs" },
      { key: "amount_approved_tzs", header: "admin.petty_cash.amount_approved", type: "tzs" },
      { key: "amount_received_tzs", header: "admin.petty_cash.amount_received", type: "tzs" },
      { key: "amount_spent_tzs", header: "admin.petty_cash.amount_spent", type: "tzs" },
      { key: "balance_tzs", header: "admin.petty_cash.balance", type: "tzs" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

// ---------------------------------------------------------------- travel coordination

const timeMinus = (time: unknown, hours: number) => {
  const m = /^(\d{2}):(\d{2})/.exec(String(time ?? ""));
  if (!m) return undefined;
  const total = (((Number(m[1]) * 60 + Number(m[2]) - Math.round(hours * 60)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const busTerminal = (v: Record<string, unknown>) => {
  const name = String(v.bus_terminal ?? "").trim();
  return !name ? null : /terminal|stand|station/i.test(name) ? name : `${name} Bus Terminal`;
};
const chosenTerminal = (v: Record<string, unknown>) => (v.transport_mode === "bus" ? busTerminal(v) : (v.terminal as string) || null);

const travelFields = (direction: "departure" | "arrival"): Field[] => [
  { name: "direction", label: "common.record", control: "hidden" },
  { name: "travel_date", label: "common.date", control: "date", required: true },
  // Each traveller with the email and phone the pickup details are sent to (Add traveller opens a dialog).
  {
    name: "traveller_list",
    label: "travel.travellers",
    control: "rows",
    childTable: "travel_travellers",
    fk: "movement_id",
    dialog: true,
    minRows: 1,
    addLabel: "travel.add_traveller",
    description: "travel.traveller_contact_hint",
    fields: [
      { name: "name", label: "travel.traveller_name", control: "text", required: true },
      { name: "email", label: "travel.traveller_email", control: "email" },
      { name: "phone", label: "travel.traveller_phone", control: "tel" },
    ],
    defaultRow: () => ({ name: "", email: "", phone: "" }),
  },
  { name: "transport_mode", label: "travel.mode_of_transport", control: "radio", inline: true, options: TRANSPORT_MODES, required: true },
  {
    name: "terminal",
    label: "travel.terminal",
    control: "select",
    optionsBy: (v) => terminalOptions(v.transport_mode),
    required: true,
    showWhen: { field: "transport_mode", in: ["air", "marine", "railway"] },
    // One marine terminal: chosen by itself.
    prefill: { deps: ["transport_mode"], compute: (v) => (v.transport_mode === "marine" ? terminalOptions("marine")[0]?.value : v.transport_mode === "air" || v.transport_mode === "railway" ? "" : undefined) },
  },
  { name: "bus_terminal", label: "travel.bus_terminal", control: "text", required: true, description: "travel.bus_terminal_hint", showWhen: { field: "transport_mode", equals: "bus" } },
  { name: "flight", label: "travel.reservation_no", control: "text" },
  { name: "flight_time", label: direction === "departure" ? "travel.departure_time" : "travel.arrival_time", control: "time", required: true },
  ...(direction === "departure"
    ? ([
        { name: "pickup_from", label: "travel.pickup_from", control: "text", required: true },
        {
          name: "pickup_time",
          label: "travel.pickup_time",
          control: "time",
          description: "travel.pickup_rule",
          // Air, marine and railway: 3 hours before (JNIA 3.5 hours); bus: 2.5 hours.
          prefill: { deps: ["transport_mode", "terminal", "flight_time"], compute: (v) => timeMinus(v.flight_time, pickupLeadHours(v.transport_mode, v.terminal)) },
        },
        { name: "transport_to", label: "travel.transport_to", control: "auto", format: "text", compute: (v) => chosenTerminal(v) },
      ] as Field[])
    : ([
        { name: "pickup_from", label: "travel.pickup_from", control: "auto", format: "text", compute: (v) => chosenTerminal(v) },
        { name: "transport_to", label: "travel.transport_to", control: "text" },
        { name: "host", label: "travel.host", control: "text", required: true },
      ] as Field[])),
  { name: "driver_id", label: "inspections.driver", control: "select", source: "drivers" },
  { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles", description: "travel.vehicle_optional" },
  { name: "notes", label: "common.notes", control: "textarea" },
];

const travelColumns = (direction: "departure" | "arrival"): ColumnSpec[] => [
  { key: "travel_date", header: "common.date", type: "date" },
  { key: "travellers", header: "travel.travellers", type: "multiline" },
  { key: "traveller_phone", header: "travel.phone", type: "multiline" },
  { key: "transport_mode", header: "travel.mode", type: "label", options: TRANSPORT_MODES },
  { key: "terminal", header: "travel.terminal" },
  { key: "flight", header: "travel.reservation_no" },
  { key: "flight_time", header: direction === "departure" ? "travel.departure_time" : "travel.arrival_time", type: "time" },
  { key: "pickup_from", header: "travel.pickup_from" },
  ...(direction === "departure" ? ([{ key: "pickup_time", header: "travel.pickup_time", type: "time" }] as ColumnSpec[]) : []),
  { key: "transport_to", header: "travel.transport_to" },
  ...(direction === "arrival" ? ([{ key: "host", header: "travel.host" }] as ColumnSpec[]) : []),
  { key: "driver.full_name", header: "inspections.driver" },
  { key: "driver.phone", header: "admin.outstation.phone" },
  { key: "vehicle_name", header: "inspections.vehicle" },
  { key: "vehicle.registration", header: "travel.reg" },
  { key: "notified_at", header: "travel.sent_to_traveller", type: "datetime" },
];

const travelModule = (direction: "departure" | "arrival"): ModuleDef => ({
  key: direction === "departure" ? "expenses.travel.departures" : "expenses.travel.arrivals",
  path: direction === "departure" ? "/travel/departures" : "/travel/arrivals",
  landOn: "month",
  resource: "expenses.travel",
  table: "travel_movements",
  title: direction === "departure" ? "travel.departures.title" : "travel.arrivals.title",
  description: direction === "departure" ? "travel.departures.description" : "travel.arrivals.description",
  newLabel: direction === "departure" ? "travel.departures.new" : "travel.arrivals.new",
  exportName: direction === "departure" ? "local-departures" : "local-arrivals",
  optionSources: ["drivers", "vehicles"],
  fixed: { direction },
  detailExtra: "travel_notify",
  titleOf: (r) => `${r.travel_date ?? ""} ${r.flight ?? ""}`.trim(),
  schema: { table: "travel_movements", resource: "expenses.travel", omitOnSave: ["notified_at", "notified_to"], sections: [{ fields: travelFields(direction) }] },
  list: {
    select: "*, driver:drivers(full_name, phone), vehicle:vehicles(make, model, registration)",
    eq: { direction },
    orderBy: { column: "travel_date", ascending: false },
    searchKeys: ["travellers", "terminal", "flight", "driver.full_name", "traveller_phone"],
    derive: (r) => {
      const v = r.vehicle as { make?: string; model?: string } | null;
      return { vehicle_name: v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() : null };
    },
    columns: travelColumns(direction),
  },
});

/** One spend of a petty cash request, with its receipt. Verified by the fleet manager, then the HOD. */
export const pettyCashTransactions: ModuleDef = {
  key: "expenses.admin.petty_cash.transactions",
  path: "/administration/petty-cash/transactions",
  landOn: "month",
  resource: "expenses.admin.petty_cash",
  table: "petty_cash_transactions",
  title: "admin.petty_cash.transactions",
  description: "admin.petty_cash.transactions_description",
  newLabel: "admin.petty_cash.add_transaction",
  exportName: "petty-cash-transactions",
  optionSources: ["petty_cash_requests"],
  isRequest: true,
  editableStatuses: ["draft", "rejected"],
  // Transactions are verified (fleet manager, then HOD), not approved.
  statusLabels: { approved: "status.verified" },
  titleOf: (r) => `${r.description ?? ""} ${r.txn_date ?? ""}`.trim(),
  schema: {
    table: "petty_cash_transactions",
    resource: "expenses.admin.petty_cash",
    isRequest: true,
    // A draft (or a rejected one) can be changed by anyone who records petty cash.
    creatorEditsDraft: "anyone",
    sections: [
      {
        fields: [
          { name: "petty_cash_request_id", label: "admin.petty_cash.request_for", control: "select", source: "petty_cash_requests", required: true, description: "admin.petty_cash.request_for_hint" },
          { name: "txn_date", label: "common.date", control: "date", required: true },
          { name: "description", label: "admin.petty_cash.description_field", control: "text", required: true },
          { name: "quantity", label: "expenses.misc.quantity", control: "number", min: 0, step: 0.01, required: true },
          { name: "unit", label: "expenses.misc.unit", control: "text" },
          { name: "price_tzs", label: "admin.petty_cash.price", control: "number", min: 0, unit: "TZS", required: true },
          { name: "amount_tzs", label: "expenses.misc.amount", control: "auto", format: "tzs", compute: (v) => (v.quantity === "" || v.price_tzs === "" ? null : Number(v.quantity) * Number(v.price_tzs)) },
        ],
      },
      {
        title: "admin.petty_cash.doc.receipt",
        description: "admin.petty_cash.receipt_hint",
        fields: [{ name: "receipt", label: "admin.petty_cash.doc.receipt", control: "file", bucket: "forms", labels: ["admin.petty_cash.doc.receipt"] }],
      },
    ],
  },
  list: {
    select: "*, request:petty_cash_requests(requester_name, purpose)",
    orderBy: { column: "txn_date", ascending: false },
    searchKeys: ["description", "request.requester_name", "status"],
    statusColumn: "status",
    columns: [
      { key: "txn_date", header: "common.date", type: "date" },
      { key: "request.requester_name", header: "admin.petty_cash.requester" },
      { key: "description", header: "admin.petty_cash.description_field" },
      { key: "quantity", header: "expenses.misc.quantity", type: "number" },
      { key: "price_tzs", header: "admin.petty_cash.price", type: "tzs" },
      { key: "amount_tzs", header: "expenses.misc.amount", type: "tzs" },
      { key: "status", header: "common.status", type: "status" },
    ],
  },
};

export const travelDepartures = travelModule("departure");
export const travelArrivals = travelModule("arrival");

/** Fleet expenses: anything bought for the fleet that has no page of its own. */
export const miscExpenses: ModuleDef = {
  key: "expenses.misc",
  path: "/expenses/misc",
  landOn: "month",
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
