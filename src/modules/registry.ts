import { allFields, type Field } from "@/lib/forms/schema";
import type { ColumnSpec, ModuleDef } from "./types";
import { dailyInspections, mobilizationInspections, thirdPartyInspections, weeklyInspections } from "./inspections";
import { fuelIssues, fuelLog, kmLogs, tripRequests } from "./daily-use";
import { fleetRoster, miscExpenses, outstationAllowances, pettyCash, pettyCashTransactions, travelAirports, travelArrivals, travelDepartures } from "./administration";
import {
  fuelExpenses,
  incidents,
  leaveBalances,
  leavePlans,
  leaveRequests,
  maintenanceCosts,
  maintenanceCostOnly,
  maintenanceInvoices,
  maintenancePurchaseOrders,
  maintenanceSpareParts,
  maintenanceWorkOrders,
  repairCostOnly,
  mandatoryTrainings,
  timesheets,
  toolboxPlans,
  tyreRequests,
  washRequests,
} from "./expenses";

const DEFINED: ModuleDef[] = [
  dailyInspections,
  weeklyInspections,
  mobilizationInspections,
  thirdPartyInspections,
  kmLogs,
  fuelLog,
  fuelIssues,
  tripRequests,
  fuelExpenses,
  maintenanceCosts,
  maintenanceWorkOrders,
  maintenanceSpareParts,
  maintenanceInvoices,
  maintenancePurchaseOrders,
  maintenanceCostOnly,
  repairCostOnly,
  tyreRequests,
  washRequests,
  mandatoryTrainings,
  toolboxPlans,
  timesheets,
  leavePlans,
  leaveRequests,
  leaveBalances,
  incidents,
  fleetRoster,
  outstationAllowances,
  pettyCash,
  pettyCashTransactions,
  miscExpenses,
  travelDepartures,
  travelArrivals,
  travelAirports,
];

/** The first file field of a module's form, where its documents are uploaded. */
export function moduleFileField(def: ModuleDef) {
  return allFields(def.schema).find((f) => f.control === "file") as (Field & { bucket?: string; labels?: string[]; sensitive?: boolean }) | undefined;
}

const DOCS_COLUMN: ColumnSpec = { key: "docs", header: "docs.column", type: "docs", sortable: false };
const withDocs = (cols: ColumnSpec[] | undefined) => (cols && !cols.some((c) => c.type === "docs") ? [...cols, DOCS_COLUMN] : cols);

export const MODULES: ModuleDef[] = DEFINED.map((m) =>
  moduleFileField(m) ? { ...m, list: { ...m.list, columns: withDocs(m.list.columns)!, detailColumns: withDocs(m.list.detailColumns) } } : m,
);

const byKey = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDef {
  const m = byKey.get(key);
  if (!m) throw new Error(`Unknown module ${key}`);
  return m;
}

export type { ModuleDef } from "./types";
