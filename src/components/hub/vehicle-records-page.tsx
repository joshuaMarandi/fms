import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { RecordTitle } from "@/components/modules/record-title";
import { ModuleTable } from "@/components/modules/module-table";
import { RecordsFilter } from "./records-filter";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getModule } from "@/modules/registry";
import { todayISO } from "@/lib/utils";
import { t } from "@/i18n";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Records of one vehicle (and one month for daily records), opened from a vehicle hub.
 * Filters change the vehicle and the month; "all" shows every vehicle.
 */
export async function VehicleRecordsPage({
  moduleKey,
  searchParams,
  dateColumn,
  monthly,
  hubHref,
  hubLabel,
}: {
  moduleKey: string;
  searchParams: Record<string, string | string[] | undefined>;
  dateColumn: string;
  monthly: boolean;
  hubHref: string;
  hubLabel: string;
}) {
  const def = getModule(moduleKey);
  const session = await requirePermission(def.resource, "view");
  const supabase = await createClient();

  const vehicleParam = one(searchParams.vehicle) ?? "all";
  const vehicle = /^[0-9a-f-]{36}$/i.test(vehicleParam) ? vehicleParam : null;
  const monthParam = one(searchParams.month);
  const month = monthly && monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null;

  let query = supabase.from(def.table).select(def.list.select).is("deleted_at", null);
  for (const [k, v] of Object.entries(def.list.eq ?? {})) query = query.eq(k, v);
  if (vehicle) query = query.eq("vehicle_id", vehicle);
  if (month) {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    query = query.gte(dateColumn, `${month}-01`).lt(dateColumn, next);
  }
  if (def.list.orderBy) query = query.order(def.list.orderBy.column, { ascending: def.list.orderBy.ascending ?? true });
  query = query.limit(1000);

  const [{ data, error }, { data: vehicles }] = await Promise.all([
    query,
    supabase.from("vehicles").select("id, registration, make, model").is("deleted_at", null).order("registration"),
  ]);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>;

  // Previous record date per group (for example the vehicle's previous third-party inspection).
  const prev = def.list.previous;
  if (prev) {
    const sorted = [...rows].sort((a, b) => String(a[prev.group]).localeCompare(String(b[prev.group])) || String(a[prev.date]).localeCompare(String(b[prev.date])));
    for (let i = 0; i < sorted.length; i++) {
      const before = sorted[i - 1];
      sorted[i]![prev.as] = before && before[prev.group] === sorted[i]![prev.group] ? before[prev.date] : null;
    }
  }

  const vList = (vehicles ?? []) as { id: string; registration: string; make: string; model: string }[];
  const current = vehicle ? vList.find((v) => v.id === vehicle) : null;
  const [cy, cm] = todayISO().split("-").map(Number) as [number, number];
  const monthLabel = month ? `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}` : t("hub.all_months");
  const title = current ? `${current.registration} · ${t(def.title)}` : t(def.title);
  const description = [current ? `${current.make} ${current.model}` : t("hub.all_vehicles"), monthly ? monthLabel : null].filter(Boolean).join(" · ");

  return (
    <>
      <RecordTitle title={title} />
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href={hubHref}>
                <ArrowLeft /> {hubLabel}
              </Link>
            </Button>
            {session.can(def.resource, "create") ? (
              <Button asChild className="h-10">
                <Link href={`${def.path}/new${vehicle ? `?vehicle=${vehicle}` : ""}`}>
                  <Plus /> {t(def.newLabel)}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <RecordsFilter
        basePath={def.path}
        vehicles={vList.map((v) => ({ value: v.id, label: `${v.registration} (${v.make} ${v.model})`, keywords: [v.registration, v.make, v.model] }))}
        vehicle={vehicle}
        month={month}
        monthly={monthly}
        currentYear={cy}
        currentMonth={cm}
      />
      {error ? <p className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error.message}</p> : null}
      <ModuleTable moduleKey={def.key} rows={rows} hiddenColumns={vehicle ? ["vehicle.registration"] : []} />
    </>
  );
}
