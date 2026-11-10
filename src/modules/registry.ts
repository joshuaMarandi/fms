import type { ModuleDef } from "./types";
import { dailyInspections, firstAidInspections, thirdPartyInspections } from "./inspections";
import { fuelLog, kmLogs, tripRequests } from "./daily-use";
import {
  fuelExpenses,
  incidents,
  leaveBalances,
  leavePlans,
  leaveRequests,
  maintenanceCosts,
  maintenanceRequests,
  mandatoryTrainings,
  timesheets,
  toolboxPlans,
  tyreRequests,
  vehicleEquipment,
  washRequests,
  workOrders,
} from "./expenses";

export const MODULES: ModuleDef[] = [
  dailyInspections,
  thirdPartyInspections,
  firstAidInspections,
  kmLogs,
  fuelLog,
  tripRequests,
  fuelExpenses,
  maintenanceRequests,
  workOrders,
  maintenanceCosts,
  tyreRequests,
  washRequests,
  vehicleEquipment,
  mandatoryTrainings,
  toolboxPlans,
  timesheets,
  leavePlans,
  leaveRequests,
  leaveBalances,
  incidents,
];

const byKey = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDef {
  const m = byKey.get(key);
  if (!m) throw new Error(`Unknown module ${key}`);
  return m;
}

export type { ModuleDef } from "./types";
