"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/permissions/provider";
import { t } from "@/i18n";

/** The main create action for the current page: resource key, href and label key. */
export const QUICK_ACTIONS: { prefix: string; resource: string; href: string; label: string }[] = [
  { prefix: "/fleet", resource: "fleet.details", href: "/fleet/new", label: "fleet.add_vehicle" },
  { prefix: "/drivers", resource: "drivers.personal", href: "/drivers/new", label: "drivers.add_driver" },
  { prefix: "/inspections/daily", resource: "inspections.daily", href: "/inspections/daily/new", label: "inspections.new" },
  { prefix: "/inspections/third-party", resource: "inspections.third_party", href: "/inspections/third-party/new", label: "inspections.new" },
  { prefix: "/inspections/first-aid", resource: "inspections.first_aid", href: "/inspections/first-aid/new", label: "inspections.new" },
  { prefix: "/daily-use/km-log", resource: "daily_use.km_log", href: "/daily-use/km-log/new", label: "daily_use.km_log.new" },
  { prefix: "/daily-use/fuel-log", resource: "daily_use.fuel_log", href: "/daily-use/fuel-log/new", label: "daily_use.fuel.new" },
  { prefix: "/daily-use/trip-requests", resource: "daily_use.trip_requests", href: "/daily-use/trip-requests/new", label: "daily_use.trips.new" },
  { prefix: "/expenses/maintenance/requests", resource: "expenses.maintenance.requests", href: "/expenses/maintenance/requests/new", label: "expenses.maintenance.new" },
  { prefix: "/expenses/maintenance/work-orders", resource: "expenses.maintenance.work_orders", href: "/expenses/maintenance/work-orders/new", label: "expenses.maintenance.work_orders.new" },
  { prefix: "/expenses/maintenance/costs", resource: "expenses.maintenance.costs", href: "/expenses/maintenance/costs/new", label: "expenses.maintenance.costs.new" },
  { prefix: "/expenses/tyres", resource: "expenses.tyres", href: "/expenses/tyres/new", label: "expenses.tyres.new" },
  { prefix: "/expenses/washing", resource: "expenses.washing", href: "/expenses/washing/new", label: "expenses.washing.new" },
  { prefix: "/expenses/equipment", resource: "expenses.equipment", href: "/expenses/equipment/new", label: "expenses.equipment.new" },
  { prefix: "/expenses/trainings/mandatory", resource: "expenses.trainings.mandatory", href: "/expenses/trainings/mandatory/new", label: "expenses.trainings.mandatory.new" },
  { prefix: "/expenses/trainings/toolbox", resource: "expenses.trainings.toolbox", href: "/expenses/trainings/toolbox/new", label: "expenses.trainings.toolbox.new" },
  { prefix: "/expenses/timesheet", resource: "expenses.timesheet", href: "/expenses/timesheet/new", label: "expenses.timesheet.new" },
  { prefix: "/expenses/leave/plan", resource: "expenses.leave.plan", href: "/expenses/leave/plan/new", label: "expenses.leave.plan.new" },
  { prefix: "/expenses/leave/requests", resource: "expenses.leave.requests", href: "/expenses/leave/requests/new", label: "expenses.leave.requests.new" },
  { prefix: "/expenses/leave/balances", resource: "expenses.leave.balances", href: "/expenses/leave/balances/new", label: "expenses.leave.balances.new" },
  { prefix: "/expenses/safety/incidents", resource: "expenses.safety.incidents", href: "/expenses/safety/incidents/new", label: "expenses.safety.incidents.new" },
  { prefix: "/settings/users", resource: "settings.users", href: "/settings/users?invite=1", label: "settings.users.invite" },
  { prefix: "/settings/roles", resource: "settings.roles", href: "/settings/roles?add=1", label: "settings.roles.add" },
];

export function QuickAction() {
  const pathname = usePathname();
  const can = useCan();
  const match = [...QUICK_ACTIONS].sort((a, b) => b.prefix.length - a.prefix.length).find((a) => pathname === a.prefix || pathname.startsWith(a.prefix + "/") || pathname.startsWith(a.prefix + "?"));
  if (!match || !can(match.resource, "create")) return null;
  if (pathname.endsWith("/new")) return null;
  return (
    <Button asChild className="h-10">
      <Link href={match.href}>
        <Plus /> <span className="hidden sm:inline">{t(match.label)}</span>
        <span className="sm:hidden">{t("nav.quick_action")}</span>
      </Link>
    </Button>
  );
}
