import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { HubSummary, VehicleHub, type HubCell, type HubColumn, type HubKind, type HubVehicle } from "@/components/hub/vehicle-hub";
import { AddMenu, ViewAllMenu } from "@/components/hub/view-all-menu";
import { loadHubVehicles, num } from "@/components/hub/hub-data";
import { requireSession } from "@/lib/auth/session";
import { daysFromNowISO, formatDate, formatNumber, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

const COLUMNS: HubColumn[] = [
  { key: "registration", label: "fleet.reg" },
  { key: "makeModel", label: "fleet.make_model" },
  { key: "last", label: "hub.col.last_inspection" },
  { key: "next", label: "hub.col.next_inspection" },
  { key: "actions", label: "hub.col.actions" },
  { key: "status", label: "common.status" },
];

/** Inspections: summary, then every vehicle; a vehicle opens its daily, third-party or first aid records. */
export default async function InspectionsPage() {
  const session = await requireSession();
  if (session.platformMode) redirect("/platform");
  const kinds: HubKind[] = [
    session.can("inspections.daily", "view") ? { key: "daily", label: t("inspections.daily.title"), description: t("hub.kind.daily"), icon: "sun", path: "/inspections/daily", monthly: true, table: "daily_inspections" } : null,
    session.can("inspections.third_party", "view") ? { key: "third_party", label: t("inspections.third_party.title"), description: t("hub.kind.third_party"), icon: "badge-check", path: "/inspections/third-party", monthly: false } : null,
    session.can("inspections.first_aid", "view") ? { key: "first_aid", label: t("inspections.first_aid.title"), description: t("hub.kind.first_aid"), icon: "briefcase-medical", path: "/inspections/first-aid", monthly: false } : null,
  ].filter((k): k is HubKind => k !== null);
  if (kinds.length === 0) redirect("/no-access?resource=inspections&action=view");

  const rows = await loadHubVehicles();
  const today = todayISO();
  const in30 = daysFromNowISO(30);
  const [cy, cm] = today.split("-").map(Number) as [number, number];

  const inService = rows.filter((r) => r.status === "in_service");
  const inspectedToday = inService.filter((r) => r.a.last_inspection_date === today).length;
  const openActions = rows.reduce((s, r) => s + num(r.a.open_actions), 0);
  const notSafe = rows.filter((r) => r.not_safe).length;

  const vehicles: HubVehicle[] = rows.map((r) => {
    const last = r.a.last_inspection_date as string | null;
    const remark = r.a.last_inspection_remark as string | null;
    const actions = num(r.a.open_actions);
    let chip: HubVehicle["chip"];
    if (!last) chip = { label: t("hub.not_inspected"), tone: "neutral" };
    else if (last === today) chip = remark === "anomalies" ? { label: t("hub.inspected_today_anomalies"), tone: "warning" } : { label: t("hub.inspected_today"), tone: "success" };
    else chip = { label: t("hub.last_inspected", { date: formatDate(last) }), tone: "warning" };
    // Next inspection due: the earlier of the third-party renewal and the first aid kit check.
    const next = [
      r.a.third_party_next ? { date: r.a.third_party_next as string, kind: t("inspections.third_party.short") } : null,
      r.a.first_aid_next ? { date: r.a.first_aid_next as string, kind: t("inspections.first_aid.short") } : null,
    ]
      .filter((x): x is { date: string; kind: string } => !!x)
      .sort((x, y) => x.date.localeCompare(y.date))[0];
    const nextCell: HubCell = next ? { chip: { label: `${formatDate(next.date)} · ${next.kind}`, tone: next.date < today ? "danger" : next.date <= in30 ? "warning" : "success" } } : null;
    const actionsCell: HubCell = actions > 0 ? { chip: { label: actions === 1 ? t("hub.open_action_one") : t("hub.open_action_many", { count: actions }), tone: r.not_safe ? "danger" : "warning" } } : t("hub.no_open_actions");
    return {
      id: r.id,
      registration: r.registration,
      makeModel: `${r.make} ${r.model}`.trim(),
      odometerKm: r.odometer_km,
      status: r.status,
      statusReason: r.status_reason,
      notSafe: r.not_safe,
      chip,
      badge: actions > 0 ? { count: actions, label: actions === 1 ? t("hub.open_action") : t("hub.open_actions"), tone: r.not_safe ? "danger" : "warning" } : null,
      detail: t("hub.inspections_this_month", { count: num(r.a.inspections_this_month) }),
      cells: {
        last: last ? { chip: { label: formatDate(last), tone: last === today ? (remark === "anomalies" ? "warning" : "success") : "neutral" } } : t("hub.not_inspected"),
        next: nextCell,
        actions: actionsCell,
      },
    };
  });

  const newLinks = [
    session.can("inspections.daily", "create") ? { href: "/inspections/daily/new", label: t("inspections.daily.title") } : null,
    session.can("inspections.third_party", "create") ? { href: "/inspections/third-party/new", label: t("inspections.third_party.title") } : null,
    session.can("inspections.first_aid", "create") ? { href: "/inspections/first-aid/new", label: t("inspections.first_aid.title") } : null,
  ].filter((l): l is { href: string; label: string } => l !== null);

  return (
    <>
      <PageHeader
        title={t("inspections.title")}
        actions={
          <>
            {session.can("inspections", "view") ? (
              <Button asChild variant="outline" className="h-10">
                <Link href="/inspections/anomalies">
                  <AlertTriangle /> {t("hub.open_actions_title")}
                </Link>
              </Button>
            ) : null}
            <ViewAllMenu items={kinds.map((k) => ({ href: `${k.path}?vehicle=all&details=1`, label: k.label }))} />
            <AddMenu items={newLinks} label={t("inspections.add")} />
          </>
        }
      />
      <HubSummary
        tiles={[
          { label: t("hub.tile.inspected_today"), value: `${formatNumber(inspectedToday)} / ${formatNumber(inService.length)}`, sub: t("hub.tile.in_service_vehicles") },
          { label: t("hub.tile.inspections_month"), value: formatNumber(rows.reduce((s, r) => s + num(r.a.inspections_this_month), 0)), sub: t("hub.tile.daily_inspections") },
          { label: t("hub.open_actions_title"), value: formatNumber(openActions), sub: notSafe ? t("hub.tile.not_safe", { count: notSafe }) : t("hub.tile.all_safe"), tone: notSafe ? "danger" : openActions ? "warning" : undefined, href: "/inspections/anomalies" },
        ]}
      />
      <VehicleHub vehicles={vehicles} kinds={kinds} currentYear={cy} currentMonth={cm} columns={COLUMNS} />
    </>
  );
}
