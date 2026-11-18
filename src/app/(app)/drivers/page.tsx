import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DriversTable, type DriverRow } from "./drivers-table";
import { HubSummary } from "@/components/hub/vehicle-hub";
import { SummaryDates } from "@/components/hub/daily-use-hub";
import { inRange, rangeFromParams } from "@/lib/date-range";
import { daysFromNowISO, formatNumber, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

export default async function DriversPage({ searchParams }: PageProps<"/drivers">) {
  const range = rangeFromParams(await searchParams);
  const session = await requirePermission("drivers.personal", "view");
  const supabase = await createClient();

  const [{ data: drivers }, { data: licences }, { data: osha }, { data: trainings }] = await Promise.all([
    supabase.from("drivers").select("*").is("deleted_at", null).order("full_name"),
    session.can("drivers.licence", "view") ? supabase.from("driver_licences").select("driver_id, expiry_date, date_issued").is("deleted_at", null).order("expiry_date", { ascending: false }) : Promise.resolve({ data: [] }),
    session.can("drivers.osha", "view") ? supabase.from("driver_osha").select("driver_id, redo_date").is("deleted_at", null).order("redo_date", { ascending: false }) : Promise.resolve({ data: [] }),
    session.can("expenses.trainings.mandatory", "view") ? supabase.from("mandatory_trainings").select("driver_id, refresher_date").contains("courses", ["defensive_driving"]).is("deleted_at", null).order("refresher_date", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  const latest = <T extends { driver_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T>();
    for (const r of rows ?? []) if (!m.has(r.driver_id)) m.set(r.driver_id, r);
    return m;
  };
  const lic = latest((licences ?? []) as { driver_id: string; expiry_date: string; date_issued: string | null }[]);
  const osh = latest((osha ?? []) as { driver_id: string; redo_date: string }[]);
  const trn = latest((trainings ?? []) as { driver_id: string; refresher_date: string }[]);

  const rows: DriverRow[] = ((drivers ?? []) as Record<string, unknown>[]).map((d) => ({
    id: d.id as string,
    full_name: d.full_name as string,
    phone: (d.phone as string) ?? null,
    employer: (d.employer as string) ?? null,
    employment_number: (d.employment_number as string) ?? null,
    joining_date: (d.joining_date as string) ?? null,
    is_active: d.is_active as boolean,
    years_driving: d.years_driving === null || d.years_driving === undefined ? null : Number(d.years_driving),
    licence_expiry: lic.get(d.id as string)?.expiry_date ?? null,
    licence_start: lic.get(d.id as string)?.date_issued ?? null,
    osha_redo: osh.get(d.id as string)?.redo_date ?? null,
    ddt_refresher: trn.get(d.id as string)?.refresher_date ?? null,
  }));

  return (
    <>
      <PageHeader
        title={t("drivers.title")}
        description={t("drivers.description")}
        actions={
          session.can("drivers.personal", "create") ? (
            <Button asChild className="h-10">
              <Link href="/drivers/new">
                <Plus /> {t("drivers.add_driver")}
              </Link>
            </Button>
          ) : null
        }
      />
      <SummaryDates label={range ? t("drivers.summary.expiring_in", { when: range.label }) : t("drivers.summary.default")} />
      <HubSummary tiles={summaryTiles(rows, range)} />
      <DriversTable rows={rows} />
    </>
  );
}

/**
 * Summary cards: drivers, and how many licences, defensive driving refreshers and OSHA retests need
 * attention. All time: expired and due within 30 days. With dates: those falling in the dates.
 */
function summaryTiles(rows: DriverRow[], range: { from: string; to: string; label: string } | null) {
  const today = todayISO();
  const in30 = daysFromNowISO(30);
  const active = rows.filter((r) => r.is_active);
  const card = (label: string, dates: (string | null)[]) => {
    const set = dates.filter((d): d is string => !!d);
    if (range) {
      const n = set.filter((d) => inRange(range, d)).length;
      return { label, value: formatNumber(n), sub: t("drivers.summary.expiring"), tone: n ? ("warning" as const) : undefined };
    }
    const expired = set.filter((d) => d < today).length;
    const due = set.filter((d) => d >= today && d <= in30).length;
    return { label, value: formatNumber(expired + due), sub: t("drivers.summary.expired_due", { expired, due }), tone: expired ? ("danger" as const) : due ? ("warning" as const) : undefined };
  };
  return [
    { label: t("drivers.summary.total"), value: formatNumber(active.length), sub: t("drivers.summary.inactive", { count: rows.length - active.length }) },
    card(t("drivers.licence_expiry"), active.map((r) => r.licence_expiry)),
    card(t("drivers.ddt_refresher"), active.map((r) => r.ddt_refresher)),
    card(t("drivers.osha_refresher"), active.map((r) => r.osha_redo)),
  ];
}
