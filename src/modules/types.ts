import type { FormSchema, Option, OptionSource } from "@/lib/forms/schema";
import type { LoadedOptions } from "@/lib/data/records";
import type { ApprovalExtraField } from "@/components/patterns/approval-panel";

export type ColumnType = "text" | "number" | "tzs" | "date" | "datetime" | "time" | "status" | "reminder" | "reminder_date" | "bool" | "tags" | "km" | "litres" | "hours" | "label" | "actions" | "multiline" | "docs" | "discrepancy";

export type ColumnSpec = {
  /** Dot path into the row (joins come back nested, for example vehicle.registration) */
  key: string;
  /** i18n key */
  header: string;
  type?: ColumnType;
  /** For tags and label: value to label-key mapping */
  options?: Option[];
  digits?: number;
  hidden?: boolean;
  /** A header that depends on the rows shown (i18n key), for example Flight No or Train No. */
  headerBy?: (rows: Record<string, unknown>[]) => string;
  sortable?: boolean;
};

export type ListDef = {
  select: string;
  columns: ColumnSpec[];
  searchKeys?: string[];
  statusColumn?: string;
  orderBy?: { column: string; ascending?: boolean };
  /** Adds the previous record's date per group (for example the vehicle's previous inspection) as `as`. */
  previous?: { group: string; date: string; as: string };
  /** Extra equality filters applied to the list query */
  eq?: Record<string, string | number | boolean>;
  /** Extra values worked out from each row on the server (for example km start from the trips). */
  derive?: (row: Record<string, unknown>) => Record<string, unknown>;
  /** "All details" view: every field of every record in one table. */
  detailColumns?: ColumnSpec[];
  /** Select used by the "All details" view (defaults to select). */
  detailSelect?: string;
  /** Keep the vehicle column when the records of one vehicle are shown. */
  keepVehicleColumn?: boolean;
  /** A file type kept on the vehicle (label key) to show on these records, matched by date. */
  vehicleDocLabel?: string;
};

export type ModuleDef = {
  /** Resource key; also the registry key */
  key: string;
  path: string;
  resource: string;
  table: string;
  title: string;
  description: string;
  newLabel: string;
  schema: FormSchema;
  list: ListDef;
  optionSources: OptionSource[];
  titleOf: (row: Record<string, unknown>) => string;
  isRequest?: boolean;
  /** Records are written elsewhere (for example fuel cost from the fuel log): no Add button here. */
  viewOnly?: boolean;
  /** Where a record opens and is edited, when that is another page (defaults to path). */
  recordPath?: string;
  approvalExtra?: (options: LoadedOptions, record: Record<string, unknown>) => ApprovalExtraField[];
  /** Name of a custom detail block rendered under the form (see modules/extras.tsx) */
  detailExtra?: string;
  /** Name of a custom block rendered above the list (see modules/extras.tsx) */
  listExtra?: string;
  /**
   * The list opens on the current month (records kept by month) or on today (records kept by day),
   * with that choice first in the date filter; other dates, or any date, from the filter.
   */
  landOn?: "month" | "day";
  exportName: string;
  /** Values every record of this module carries (for example kind: internal), saved with the form. */
  fixed?: Record<string, unknown>;
  /** Request rows stay editable only in these statuses */
  editableStatuses?: string[];
};
