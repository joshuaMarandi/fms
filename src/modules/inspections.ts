import type { ModuleDef } from "./types";
import type { Field } from "@/lib/forms/schema";

const anomalyRowFields: Field[] = [
  { name: "description", label: "inspections.anomaly.description", control: "textarea", required: true, colSpan: 2 },
  { name: "action_required", label: "inspections.anomaly.action", control: "textarea", required: true, colSpan: 2 },
  {
    name: "when_to_act",
    label: "inspections.anomaly.when",
    control: "radio",
    required: true,
    options: [
      { value: "immediately", label: "inspections.anomaly.when.immediately" },
      { value: "before_next_service", label: "inspections.anomaly.when.before_next_service" },
      { value: "at_next_service", label: "inspections.anomaly.when.at_next_service" },
    ],
  },
  {
    name: "status",
    label: "inspections.anomaly.status",
    control: "radio",
    required: true,
    options: [
      { value: "open", label: "status.open" },
      { value: "closed", label: "status.closed" },
    ],
  },
  { name: "date_opened", label: "inspections.anomaly.date_opened", control: "date", required: true },
  { name: "date_closed", label: "inspections.anomaly.date_closed", control: "date", showWhen: { field: "status", equals: "closed" }, description: "inspections.anomaly.date_closed_hint" },
];

const inspectionCore = (childFk: string): Field[] => [
  {
    name: "driver_id",
    label: "inspections.driver_name",
    control: "select",
    source: "drivers",
    description: "Auto: the current driver when left empty",
  },
  { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles", required: true },
  { name: "inspection_date", label: "inspections.date", control: "date", required: true },
  { name: "mileage_km", label: "inspections.mileage", control: "number", min: 0, unit: "km", required: true },
  {
    name: "remark",
    label: "inspections.remark",
    control: "radio",
    required: true,
    options: [
      { value: "safe", label: "inspections.remark.safe" },
      { value: "anomalies", label: "inspections.remark.anomalies" },
    ],
  },
  {
    name: "anomalies",
    label: "inspections.anomalies",
    control: "rows",
    childTable: "inspection_anomalies",
    fk: childFk,
    minRows: 1,
    showWhen: { field: "remark", equals: "anomalies" },
    fields: anomalyRowFields,
    defaultRow: () => ({ description: "", action_required: "", when_to_act: "before_next_service", status: "open", date_opened: new Date().toISOString().slice(0, 10), date_closed: "" }),
  },
  { name: "scan", label: "inspections.scanned_report", control: "file", bucket: "inspection-scans", labels: ["inspections.scanned_report"] },
];

export const dailyInspections: ModuleDef = {
  key: "inspections.daily",
  path: "/inspections/daily",
  resource: "inspections.daily",
  table: "daily_inspections",
  title: "inspections.daily.title",
  description: "inspections.daily.description",
  newLabel: "inspections.new",
  exportName: "daily-inspections",
  optionSources: ["vehicles", "drivers"],
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.inspection_date ?? ""}`.trim(),
  schema: {
    table: "daily_inspections",
    resource: "inspections.daily",
    sections: [{ fields: inspectionCore("daily_inspection_id") }],
  },
  list: {
    select: "*, vehicle:vehicles(registration), driver:drivers(full_name), actions:inspection_anomalies(action_required, status, deleted_at)",
    orderBy: { column: "inspection_date", ascending: false },
    searchKeys: ["vehicle.registration", "driver.full_name"],
    statusColumn: "remark",
    columns: [
      { key: "inspection_date", header: "inspections.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "driver.full_name", header: "inspections.driver_name" },
      { key: "remark", header: "inspections.remark", type: "status" },
      { key: "actions", header: "inspections.action", type: "actions", sortable: false },
    ],
  },
};

export const thirdPartyInspections: ModuleDef = {
  key: "inspections.third_party",
  path: "/inspections/third-party",
  resource: "inspections.third_party",
  table: "third_party_inspections",
  title: "inspections.third_party.title",
  description: "inspections.third_party.description",
  newLabel: "inspections.new",
  exportName: "third-party-inspections",
  optionSources: ["vehicles", "drivers"],
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.inspection_date ?? ""}`.trim(),
  schema: {
    table: "third_party_inspections",
    resource: "inspections.third_party",
    sections: [
      {
        fields: [
          ...inspectionCore("third_party_inspection_id").filter((f) => f.name !== "scan"),
          { name: "inspector", label: "inspections.inspector", control: "text" },
          { name: "renewal_date", label: "inspections.renewal_date", control: "date", required: true, description: "Reminder" },
          { name: "scan", label: "inspections.scanned_report", control: "file", bucket: "inspection-scans", labels: ["inspections.scanned_report"] },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration), driver:drivers(full_name)",
    orderBy: { column: "inspection_date", ascending: false },
    searchKeys: ["vehicle.registration", "inspector"],
    statusColumn: "remark",
    previous: { group: "vehicle_id", date: "inspection_date", as: "previous_date" },
    columns: [
      { key: "inspection_date", header: "inspections.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "inspector", header: "inspections.inspector" },
      { key: "previous_date", header: "inspections.previous_date", type: "date" },
      { key: "renewal_date", header: "inspections.next_date", type: "reminder_date" },
    ],
  },
};

const FIRST_AID_ITEMS = ["Sterile gauze pads", "Adhesive bandages", "Crepe bandage", "Antiseptic solution", "Burn dressing", "Disposable gloves", "Scissors", "Tweezers", "CPR face shield", "Eye wash", "Triangular bandage", "First aid manual"];

export const firstAidInspections: ModuleDef = {
  key: "inspections.first_aid",
  path: "/inspections/first-aid",
  resource: "inspections.first_aid",
  table: "first_aid_inspections",
  title: "inspections.first_aid.title",
  description: "inspections.first_aid.description",
  newLabel: "inspections.new",
  exportName: "first-aid-inspections",
  optionSources: ["vehicles"],
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.inspected_on ?? ""}`.trim(),
  schema: {
    table: "first_aid_inspections",
    resource: "inspections.first_aid",
    sections: [
      {
        fields: [
          { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles", required: true },
          { name: "inspected_on", label: "inspections.first_aid.inspected_on", control: "date", required: true },
          { name: "inspector_name", label: "inspections.first_aid.inspector_name", control: "text", required: true },
          { name: "inspector_qualification", label: "inspections.first_aid.qualification", control: "text" },
          { name: "next_inspection_date", label: "inspections.first_aid.next", control: "date" },
          { name: "notes", label: "common.notes", control: "textarea" },
        ],
      },
      {
        title: "inspections.first_aid.items",
        fields: [
          {
            name: "items",
            label: "inspections.first_aid.items",
            control: "rows",
            childTable: "first_aid_items",
            fk: "inspection_id",
            fields: [
              { name: "item_name", label: "inspections.first_aid.item", control: "text", required: true },
              { name: "present", label: "inspections.first_aid.present", control: "checkbox" },
              { name: "quantity", label: "inspections.first_aid.quantity", control: "number", min: 0, integer: true },
              { name: "expiry_date", label: "inspections.first_aid.expiry", control: "date" },
              { name: "remark", label: "common.remarks", control: "text" },
            ],
            defaultRow: (_values, rows) => ({ item_name: FIRST_AID_ITEMS[rows.length] ?? "", present: true, quantity: 1, expiry_date: "", remark: "" }),
          },
          { name: "signature", label: "signature.title", control: "signature", required: true },
          { name: "form", label: "inspections.first_aid.report", control: "file", bucket: "inspection-scans", labels: ["inspections.first_aid.report"] },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    orderBy: { column: "inspected_on", ascending: false },
    searchKeys: ["vehicle.registration", "inspector_name"],
    columns: [
      { key: "inspected_on", header: "inspections.first_aid.inspected_on", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "inspector_name", header: "inspections.first_aid.inspector_name" },
      { key: "next_inspection_date", header: "inspections.first_aid.next", type: "reminder_date" },
    ],
  },
};

export const FIRST_AID_DEFAULT_ITEMS = FIRST_AID_ITEMS;
