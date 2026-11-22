import { MODULES } from "@/modules/registry";

/** The main create action for the current page: resource key, href and label key. */
export const QUICK_ACTIONS: { prefix: string; resource: string; href: string; label: string }[] = [
  { prefix: "/fleet", resource: "fleet.details", href: "/fleet/new", label: "fleet.add_vehicle" },
  { prefix: "/drivers", resource: "drivers.personal", href: "/drivers/new", label: "drivers.add_driver" },
  { prefix: "/inspections/daily", resource: "inspections.daily", href: "/inspections/daily/new", label: "inspections.new" },
  { prefix: "/inspections/weekly", resource: "inspections.daily", href: "/inspections/weekly/new", label: "inspections.new" },
  { prefix: "/inspections/third-party", resource: "inspections.third_party", href: "/inspections/third-party/new", label: "inspections.new" },
  { prefix: "/inspections/mobilization", resource: "fleet.inspection_status", href: "/inspections/mobilization/new", label: "inspections.new" },
  { prefix: "/daily-use/km-log", resource: "daily_use.km_log", href: "/daily-use/km-log/new", label: "daily_use.km_log.new" },
  { prefix: "/daily-use/fuel-requests", resource: "daily_use.fuel_log", href: "/daily-use/fuel-requests/new", label: "daily_use.fuel.new" },
  { prefix: "/daily-use/fuel-log", resource: "daily_use.fuel_log", href: "/daily-use/fuel-requests/new", label: "daily_use.fuel.new" },
  { prefix: "/daily-use/trip-requests", resource: "daily_use.trip_requests", href: "/daily-use/trip-requests/new", label: "daily_use.trips.new" },
  { prefix: "/expenses/maintenance/costs", resource: "expenses.maintenance.costs", href: "/expenses/maintenance/costs/new", label: "expenses.maintenance.costs.new" },
  { prefix: "/travel/departures", resource: "expenses.travel", href: "/travel/departures/new", label: "travel.departures.new" },
  { prefix: "/travel/arrivals", resource: "expenses.travel", href: "/travel/arrivals/new", label: "travel.arrivals.new" },
  { prefix: "/expenses/misc", resource: "expenses.misc", href: "/expenses/misc/new", label: "expenses.misc.new" },
  { prefix: "/administration/outstation", resource: "expenses.admin.outstation", href: "/administration/outstation/new", label: "admin.outstation.new" },
  { prefix: "/administration/petty-cash/transactions", resource: "expenses.admin.petty_cash", href: "/administration/petty-cash/transactions/new", label: "admin.petty_cash.add_transaction" },
  { prefix: "/administration/petty-cash", resource: "expenses.admin.petty_cash", href: "/administration/petty-cash/new", label: "admin.petty_cash.new" },
  { prefix: "/expenses/tyres", resource: "expenses.tyres", href: "/expenses/tyres/new", label: "expenses.tyres.new" },
  { prefix: "/expenses/washing", resource: "expenses.washing", href: "/expenses/washing/new", label: "expenses.washing.new" },
  { prefix: "/expenses/trainings/mandatory", resource: "expenses.trainings.mandatory", href: "/expenses/trainings/mandatory/new", label: "expenses.trainings.mandatory.new" },
  { prefix: "/expenses/trainings/toolbox", resource: "expenses.trainings.toolbox", href: "/expenses/trainings/toolbox/new", label: "expenses.trainings.toolbox.new" },
  { prefix: "/expenses/timesheet", resource: "expenses.timesheet", href: "/expenses/timesheet/new", label: "expenses.timesheet.new" },
  { prefix: "/expenses/leave/plan", resource: "expenses.leave.plan", href: "/expenses/leave/plan/new", label: "expenses.leave.plan.new" },
  { prefix: "/expenses/leave/requests", resource: "expenses.leave.requests", href: "/expenses/leave/requests/new", label: "expenses.leave.requests.new" },
  { prefix: "/expenses/leave/balances", resource: "expenses.leave.balances", href: "/expenses/leave/balances/new", label: "expenses.leave.balances.new" },
  { prefix: "/expenses/safety/incidents", resource: "expenses.safety.incidents", href: "/expenses/safety/incidents/new", label: "expenses.safety.incidents.new" },
  { prefix: "/platform/companies", resource: "platform.companies", href: "/platform/companies/new", label: "platform.companies.new" },
  { prefix: "/platform/packages", resource: "platform.packages", href: "/platform/packages/new", label: "platform.packages.new" },
  { prefix: "/settings/users", resource: "settings.users", href: "/settings/users?invite=1", label: "settings.users.invite" },
  { prefix: "/settings/roles", resource: "settings.roles", href: "/settings/roles?add=1", label: "settings.roles.add" },
];

const MODULE_ACTIONS = MODULES.filter((m) => !m.viewOnly).map((m) => ({ prefix: m.path, resource: m.resource, href: `${m.path}/new`, label: m.newLabel }));

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

/**
 * The page's main create button, shown once in the top bar (pages do not repeat it). The listed
 * pages come first, then any record list (its New page).
 */
export function quickActionFor(pathname: string): { resource: string; href: string; label: string } | null {
  for (const list of [QUICK_ACTIONS, MODULE_ACTIONS]) {
    const m = [...list].sort((a, b) => b.prefix.length - a.prefix.length).find((a) => matches(pathname, a.prefix));
    if (m) return m;
  }
  return null;
}
