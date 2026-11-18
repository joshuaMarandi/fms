import type { ModuleDef } from "./types";
import { dailyInspections, mobilizationInspections, thirdPartyInspections, weeklyInspections } from "./inspections";
import { fuelIssues, fuelLog, kmLogs, tripRequests } from "./daily-use";
import { fleetRoster, miscExpenses, outstationAllowances, pettyCash, travelAirports, travelArrivals, travelDepartures } from "./administration";
import {
  fuelExpenses,
  incidents,
  leaveBalances,
  leavePlans,
  leaveRequests,
  maintenanceCosts,
  maintenanceCostOnly,
  repairCostOnly,
  maintenanceRequests,
  mandatoryTrainings,
  timesheets,
  toolboxPlans,
  tyreRequests,
  washRequests,
} from "./expenses";

export const MODULES: ModuleDef[] = [
  dailyInspections,
  weeklyInspections,
  mobilizationInspections,
  thirdPartyInspections,
  kmLogs,
  fuelLog,
  fuelIssues,
  tripRequests,
  fuelExpenses,
  maintenanceRequests,
  maintenanceCosts,
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
  miscExpenses,
  travelDepartures,
  travelArrivals,
  travelAirports,
];

const byKey = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDef {
  const m = byKey.get(key);
  if (!m) throw new Error(`Unknown module ${key}`);
  return m;
}

export type { ModuleDef } from "./types";
