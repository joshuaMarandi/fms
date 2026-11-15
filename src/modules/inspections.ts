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

/** Mobilization inspection: done before a vehicle goes to site, renewed every year or so. */
export const mobilizationInspections: ModuleDef = {
  key: "inspections.mobilization",
  path: "/inspections/mobilization",
  resource: "fleet.inspection_status",
  table: "vehicle_inspections",
  title: "inspections.mobilization.title",
  description: "inspections.mobilization.description",
  newLabel: "inspections.new",
  exportName: "mobilization-inspections",
  optionSources: ["vehicles"],
  fixed: { kind: "internal" },
  titleOf: (r) => `${(r.vehicle as { registration?: string } | undefined)?.registration ?? ""} ${r.inspection_date ?? ""}`.trim(),
  schema: {
    table: "vehicle_inspections",
    resource: "fleet.inspection_status",
    sections: [
      {
        fields: [
          { name: "vehicle_id", label: "inspections.vehicle", control: "select", source: "vehicles", required: true },
          { name: "inspection_date", label: "inspections.mobilization.date", control: "date", required: true },
          { name: "renewal_date", label: "inspections.mobilization.renewal", control: "date", description: "Reminder" },
          { name: "notes", label: "common.notes", control: "textarea" },
        ],
      },
    ],
  },
  list: {
    select: "*, vehicle:vehicles(registration)",
    eq: { kind: "internal" },
    orderBy: { column: "inspection_date", ascending: false },
    searchKeys: ["vehicle.registration"],
    previous: { group: "vehicle_id", date: "inspection_date", as: "previous_date" },
    columns: [
      { key: "inspection_date", header: "inspections.mobilization.date", type: "date" },
      { key: "vehicle.registration", header: "inspections.vehicle" },
      { key: "previous_date", header: "inspections.previous_date", type: "date" },
      { key: "renewal_date", header: "inspections.mobilization.renewal", type: "reminder_date" },
      { key: "notes", header: "common.notes", type: "multiline", sortable: false },
    ],
  },
};
