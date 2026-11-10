import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/patterns/status-chip";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

const KINDS = [
  { table: "fuel_requests", resource: "daily_use.fuel_log", path: "/daily-use/fuel-log", label: "daily_use.fuel.title", dateCol: "request_date" },
  { table: "maintenance_requests", resource: "expenses.maintenance.requests", path: "/expenses/maintenance/requests", label: "expenses.maintenance.requests.title", dateCol: "request_date" },
  { table: "tyre_requests", resource: "expenses.tyres", path: "/expenses/tyres", label: "expenses.tyres.title", dateCol: "request_date" },
  { table: "wash_requests", resource: "expenses.washing", path: "/expenses/washing", label: "expenses.washing.title", dateCol: "request_date" },
  { table: "leave_requests", resource: "expenses.leave.requests", path: "/expenses/leave/requests", label: "expenses.leave.requests.title", dateCol: "date_from" },
  { table: "timesheets", resource: "expenses.timesheet", path: "/expenses/timesheet", label: "expenses.timesheet.title", dateCol: "period_month" },
  { table: "vehicle_requests", resource: "daily_use.trip_requests", path: "/daily-use/trip-requests", label: "daily_use.trips.title", dateCol: "date_needed" },
];

/** One task per screen for drivers: all my requests in one list with a big button per type. */
export default async function MyRequestsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const kinds = KINDS.filter((k) => session.can(k.resource, "view"));
  const results = await Promise.all(kinds.map(async (k) => ({ ...k, rows: ((await supabase.from(k.table).select(`id, status, ${k.dateCol}`).is("deleted_at", null).order(k.dateCol, { ascending: false }).limit(10)).data ?? []) as unknown as Record<string, unknown>[] })));

  return (
    <>
      <PageHeader title={t("nav.requests")} description={t("daily_use.description")} />
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.filter((k) => session.can(k.resource, "create")).map((k) => (
          <Button key={k.table} asChild size="lg" variant="outline" className="h-14 justify-start">
            <Link href={`${k.path}/new`}>
              <Plus /> {t(k.label)}
            </Link>
          </Button>
        ))}
      </div>
      {results.map((k) => (
        <section key={k.table} className="page-card p-4">
          <h2 className="mb-2 text-sm font-semibold">{t(k.label)}</h2>
          {k.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("common.empty_title")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {k.rows.map((r) => (
                <li key={r.id as string}>
                  <Link href={`${k.path}/${r.id}`} className="flex min-h-[44px] items-center justify-between gap-2 py-2">
                    <span>{formatDate(r[k.dateCol] as string)}</span>
                    <StatusChip status={r.status as string} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
