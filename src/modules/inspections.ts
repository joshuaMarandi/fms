import type { ColumnSpec, ModuleDef } from "./types";
import type { Field } from "@/lib/forms/schema";
import { formatDate } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

type Anomaly = { description?: string | null; action_required?: string | null; when_to_act?: string | null; status?: string | null; date_opened?: string | null; date_closed?: string | null; deleted_at?: string | null };
const label = (k: string, fallback: string) => (hasKey(k) ? t(k) : fallback);

/** One line per anomaly for the description, action, timing and status columns. */
function anomalyLines(row: Record<string, unknown>) {
  const list = ((row.actions as Anomaly[] | null) ?? []).filter((a) => !a.deleted_at);
  const many = list.length > 1;
  const pre = (i: number) => (many ? `${i + 1}. ` : "");
  return {
    anomaly_description: list.map((a, i) => pre(i) + (a.description ?? "")).join("\n"),
    anomaly_action: list.map((a, i) => pre(i) + (a.action_required ?? "")).join("\n"),
    anomaly_when: list.map((a, i) => pre(i) + (a.when_to_act ? label(`inspections.anomaly.when.${a.when_to_act}`, a.when_to_act) : "")).join("\n"),
    anomaly_status: list
      .map((a, i) => pre(i) + label(`status.${a.status}`, a.status ?? "") + (a.status === "closed" && a.date_closed ? ` (${formatDate(a.date_closed)})` : a.date_opened ? ` (${t("inspections.opened_on", { date: formatDate(a.date_opened) })})` : ""))
      .join("\n"),
  };
}

const REMARK_OPTIONS = [
  { value: "safe", label: "inspections.remark.short.safe" },
  { value: "anomalies", label: "inspections.remark.short.anomalies" },
];
const ANOMALY_SELECT = "actions:inspection_anomalies(description, action_required, when_to_act, status, date_opened, date_closed, deleted_at)";

const anomalyDetailColumns: ColumnSpec[] = [
  { key: "remark", header: "inspections.remark", type: "label", options: REMARK_OPTIONS },
  { key: "anomaly_description", header: "inspections.col.description", type: "multiline", sortable: false },
  { key: "anomaly_action", header: "inspections.col.action", type: "multiline", sortable: false },
  { key: "anomaly_when", header: "inspections.anomaly.when", type: "multiline", sortable: false },
  { key: "anomaly_status", header: "inspections.anomaly.status", type: "multiline", sortable: false },
];

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
    addLabel: "inspections.add_anomaly",
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
    select: `*, vehicle:vehicles(registration), driver:drivers(full_name), ${ANOMALY_SELECT}`,
    orderBy: { column: "inspection_date", ascending: false },
    searchKeys: ["vehicle.registration", "driver.full_name"],
    statusColumn: "remark",
    derive: anomalyLines,
    columns: [
      { key: "inspection_date", header: "inspections.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "driver.full_name", header: "inspections.driver" },
      { key: "remark", header: "inspections.remark", type: "label", options: REMARK_OPTIONS },
      { key: "anomaly_description", header: "inspections.col.description", type: "multiline", sortable: false },
      { key: "actions", header: "inspections.col.action", type: "actions", sortable: false },
    ],
    detailColumns: [
      { key: "inspection_date", header: "inspections.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "driver.full_name", header: "inspections.driver" },
      { key: "mileage_km", header: "inspections.mileage", type: "km" },
      ...anomalyDetailColumns,
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
    select: `*, vehicle:vehicles(registration), driver:drivers(full_name), ${ANOMALY_SELECT}`,
    orderBy: { column: "inspection_date", ascending: false },
    searchKeys: ["vehicle.registration", "inspector"],
    statusColumn: "remark",
    previous: { group: "vehicle_id", date: "inspection_date", as: "previous_date" },
    derive: anomalyLines,
    detailColumns: [
      { key: "inspection_date", header: "inspections.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "driver.full_name", header: "inspections.driver" },
      { key: "mileage_km", header: "inspections.mileage", type: "km" },
      { key: "inspector", header: "inspections.inspector" },
      ...anomalyDetailColumns,
      { key: "previous_date", header: "inspections.previous_date", type: "date" },
      { key: "renewal_date", header: "inspections.next_date", type: "reminder_date" },
    ],
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
            addLabel: "inspections.first_aid.add_item",
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
    select: "*, vehicle:vehicles(registration), items:first_aid_items(item_name, present, quantity, expiry_date, remark, deleted_at)",
    orderBy: { column: "inspected_on", ascending: false },
    searchKeys: ["vehicle.registration", "inspector_name"],
    derive: (row) => {
      const items = ((row.items as { item_name: string; present: boolean | null; expiry_date: string | null; remark: string | null; deleted_at: string | null }[] | null) ?? []).filter((i) => !i.deleted_at);
      const day = String(row.inspected_on ?? "");
      return {
        items_present: items.length ? t("inspections.first_aid.present_of", { present: items.filter((i) => i.present).length, total: items.length }) : "",
        items_missing: items.filter((i) => !i.present).map((i) => i.item_name).join("\n"),
        items_expired: items.filter((i) => i.expiry_date && i.expiry_date < day).map((i) => `${i.item_name} (${formatDate(i.expiry_date)})`).join("\n"),
        items_remarks: items.filter((i) => i.remark).map((i) => `${i.item_name}: ${i.remark}`).join("\n"),
      };
    },
    detailColumns: [
      { key: "inspected_on", header: "inspections.first_aid.inspected_on", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "inspector_name", header: "inspections.first_aid.inspector_name" },
      { key: "inspector_qualification", header: "inspections.first_aid.qualification" },
      { key: "items_present", header: "inspections.first_aid.col.present" },
      { key: "items_missing", header: "inspections.first_aid.col.missing", type: "multiline", sortable: false },
      { key: "items_expired", header: "inspections.first_aid.col.expired", type: "multiline", sortable: false },
      { key: "items_remarks", header: "common.remarks", type: "multiline", sortable: false },
      { key: "notes", header: "common.notes", type: "multiline", sortable: false },
      { key: "next_inspection_date", header: "inspections.first_aid.next", type: "reminder_date" },
    ],
    columns: [
      { key: "inspected_on", header: "inspections.first_aid.inspected_on", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "inspector_name", header: "inspections.first_aid.inspector_name" },
      { key: "next_inspection_date", header: "inspections.first_aid.next", type: "reminder_date" },
    ],
  },
};

export const FIRST_AID_DEFAULT_ITEMS = FIRST_AID_ITEMS;
