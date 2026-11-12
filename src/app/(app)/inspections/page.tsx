import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { HubSummary, VehicleHub, type HubKind, type HubVehicle } from "@/components/hub/vehicle-hub";
import { loadHubVehicles, num } from "@/components/hub/hub-data";
import { requireSession } from "@/lib/auth/session";
import { daysFromNowISO, formatDate, formatNumber, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

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
  const tpDue = rows.filter((r) => r.a.third_party_next && (r.a.third_party_next as string) <= in30);
  const tpOverdue = tpDue.filter((r) => (r.a.third_party_next as string) < today).length;

  const vehicles: HubVehicle[] = rows.map((r) => {
    const last = r.a.last_inspection_date as string | null;
    const remark = r.a.last_inspection_remark as string | null;
    const actions = num(r.a.open_actions);
    let chip: HubVehicle["chip"];
    let attention = 3;
    if (!last) {
      chip = { label: t("hub.not_inspected"), tone: "neutral" };
      attention = 2;
    } else if (last === today) {
      chip = remark === "anomalies" ? { label: t("hub.inspected_today_anomalies"), tone: "warning" } : { label: t("hub.inspected_today"), tone: "success" };
      attention = remark === "anomalies" ? 1 : 4;
    } else {
      chip = { label: t("hub.last_inspected", { date: formatDate(last) }), tone: "warning" };
      attention = 2;
    }
    if (r.not_safe) attention = 0;
    else if (actions > 0) attention = Math.min(attention, 1);
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
      attention,
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
        description={t("hub.inspections_description")}
        actions={
          <>
            {session.can("inspections", "view") ? (
              <Button asChild variant="outline" className="h-10">
                <Link href="/inspections/anomalies">
                  <AlertTriangle /> {t("hub.open_actions_title")}
                </Link>
              </Button>
            ) : null}
            {newLinks.map((l, i) => (
              <Button key={l.href} asChild variant={i === 0 ? "default" : "outline"} className="h-10">
                <Link href={l.href}>
                  <Plus /> {l.label}
                </Link>
              </Button>
            ))}
          </>
        }
      />
      <HubSummary
        tiles={[
          { label: t("hub.tile.inspected_today"), value: `${formatNumber(inspectedToday)} / ${formatNumber(inService.length)}`, sub: t("hub.tile.in_service_vehicles") },
          { label: t("hub.tile.inspections_month"), value: formatNumber(rows.reduce((s, r) => s + num(r.a.inspections_this_month), 0)), sub: t("hub.tile.daily_inspections") },
          { label: t("hub.open_actions_title"), value: formatNumber(openActions), sub: notSafe ? t("hub.tile.not_safe", { count: notSafe }) : t("hub.tile.all_safe"), tone: notSafe ? "danger" : openActions ? "warning" : undefined, href: "/inspections/anomalies" },
          { label: t("hub.tile.third_party_due"), value: formatNumber(tpDue.length), sub: tpOverdue ? t("hub.tile.overdue", { count: tpOverdue }) : t("hub.tile.next_30_days"), tone: tpOverdue ? "danger" : tpDue.length ? "warning" : undefined },
        ]}
      />
      <VehicleHub vehicles={vehicles} kinds={kinds} currentYear={cy} currentMonth={cm} />
    </>
  );
}
