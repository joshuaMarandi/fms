import type { ModuleDef } from "./types";
import type { Option } from "@/lib/forms/schema";

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

const PAY_STATUS: Option[] = [
  { value: "pending", label: "admin.outstation.status.pending" },
  { value: "paid", label: "admin.outstation.status.paid" },
];

export const outstationAllowances: ModuleDef = {
  key: "expenses.admin.outstation",
  path: "/administration/outstation",
  resource: "expenses.admin.outstation",
  table: "outstation_allowances",
  title: "admin.outstation.title",
  description: "admin.outstation.description",
  newLabel: "admin.outstation.new",
  exportName: "outstation-allowance",
  optionSources: ["vehicles", "drivers"],
  titleOf: (r) => `${(r.driver as { full_name?: string } | undefined)?.full_name ?? ""} ${r.destination ?? ""}`.trim(),
  schema: {
    table: "outstation_allowances",
    resource: "expenses.admin.outstation",
    sections: [
      {
        fields: [
          { name: "driver_id", label: "inspections.driver", control: "select", source: "drivers", required: true },
          { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles" },
          { name: "destination", label: "daily_use.trips.destination", control: "text", required: true },
          { name: "purpose", label: "daily_use.trips.purpose", control: "textarea" },
          { name: "date_from", label: "common.from", control: "date", required: true },
          { name: "date_to", label: "common.to", control: "date", required: true },
          {
            name: "nights",
            label: "admin.outstation.nights",
            control: "auto",
            format: "number",
            digits: 0,
            compute: (v) => (v.date_from && v.date_to ? Math.max(0, Math.round((new Date(v.date_to as string).getTime() - new Date(v.date_from as string).getTime()) / 86400000)) : null),
          },
          { name: "rate_per_night_tzs", label: "admin.outstation.rate", control: "number", min: 0, unit: "TZS", required: true },
          {
            name: "amount_tzs",
            label: "admin.outstation.amount",
            control: "auto",
            format: "tzs",
            compute: (v) => {
              if (!v.date_from || !v.date_to || v.rate_per_night_tzs === "" || v.rate_per_night_tzs == null) return null;
              const nights = Math.max(0, Math.round((new Date(v.date_to as string).getTime() - new Date(v.date_from as string).getTime()) / 86400000));
              return nights * Number(v.rate_per_night_tzs);
            },
          },
          { name: "status", label: "common.status", control: "radio", inline: true, required: true, options: PAY_STATUS },
          { name: "paid_on", label: "admin.outstation.paid_on", control: "date", showWhen: { field: "status", equals: "paid" } },
        ],
      },
    ],
  },
  list: {
    select: "*, driver:drivers(full_name), vehicle:vehicles(registration)",
    orderBy: { column: "date_from", ascending: false },
    searchKeys: ["driver.full_name", "vehicle.registration", "destination"],
    statusColumn: "status",
    columns: [
      { key: "date_from", header: "common.from", type: "date" },
      { key: "date_to", header: "common.to", type: "date" },
      { key: "driver.full_name", header: "inspections.driver" },
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "destination", header: "daily_use.trips.destination" },
      { key: "nights", header: "admin.outstation.nights", type: "number" },
      { key: "rate_per_night_tzs", header: "admin.outstation.rate", type: "tzs" },
      { key: "amount_tzs", header: "admin.outstation.amount", type: "tzs" },
      { key: "status", header: "common.status", type: "label", options: PAY_STATUS },
    ],
  },
};

const CASH_KIND: Option[] = [
  { value: "received", label: "admin.petty_cash.kind.received" },
  { value: "spent", label: "admin.petty_cash.kind.spent" },
];

export const pettyCash: ModuleDef = {
  key: "expenses.admin.petty_cash",
  path: "/administration/petty-cash",
  resource: "expenses.admin.petty_cash",
  table: "petty_cash_entries",
  title: "admin.petty_cash.title",
  description: "admin.petty_cash.description",
  newLabel: "admin.petty_cash.new",
  exportName: "petty-cash",
  optionSources: ["vehicles"],
  listExtra: "petty_cash_summary",
  titleOf: (r) => `${r.description ?? ""} ${r.entry_date ?? ""}`.trim(),
  schema: {
    table: "petty_cash_entries",
    resource: "expenses.admin.petty_cash",
    sections: [
      {
        fields: [
          { name: "entry_date", label: "common.date", control: "date", required: true },
          { name: "kind", label: "admin.petty_cash.kind", control: "radio", inline: true, required: true, options: CASH_KIND },
          { name: "category", label: "admin.petty_cash.category", control: "text" },
          { name: "description", label: "admin.petty_cash.description_field", control: "textarea", required: true },
          { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles" },
          { name: "amount_tzs", label: "admin.petty_cash.amount", control: "number", min: 0, unit: "TZS", required: true },
          { name: "receipt_number", label: "admin.petty_cash.receipt", control: "text" },
          { name: "receipt", label: "admin.petty_cash.receipt_file", control: "file", bucket: "forms", labels: ["admin.petty_cash.receipt_file"] },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "entry_date", ascending: false },
    searchKeys: ["description", "category", "receipt_number", "vehicle.registration"],
    statusColumn: "kind",
    columns: [
      { key: "entry_date", header: "common.date", type: "date" },
      { key: "kind", header: "admin.petty_cash.kind", type: "label", options: CASH_KIND },
      { key: "category", header: "admin.petty_cash.category" },
      { key: "description", header: "admin.petty_cash.description_field" },
      { key: "vehicle.registration", header: "fleet.reg" },
      { key: "receipt_number", header: "admin.petty_cash.receipt" },
      { key: "amount_tzs", header: "admin.petty_cash.amount", type: "tzs" },
    ],
  },
};
