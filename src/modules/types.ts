import type { FormSchema, Option, OptionSource } from "@/lib/forms/schema";
import type { LoadedOptions } from "@/lib/data/records";
import type { ApprovalExtraField } from "@/components/patterns/approval-panel";

export type ColumnType = "text" | "number" | "tzs" | "date" | "datetime" | "time" | "status" | "reminder" | "reminder_date" | "bool" | "tags" | "km" | "litres" | "hours" | "label" | "actions";

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
  approvalExtra?: (options: LoadedOptions, record: Record<string, unknown>) => ApprovalExtraField[];
  /** Name of a custom detail block rendered under the form (see modules/extras.tsx) */
  detailExtra?: string;
  /** Name of a custom block rendered above the list (see modules/extras.tsx) */
  listExtra?: string;
  exportName: string;
  /** Request rows stay editable only in these statuses */
  editableStatuses?: string[];
};
