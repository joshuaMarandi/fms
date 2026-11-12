import Link from "next/link";
import { AlertTriangle, ArrowUpCircle, Building2, CalendarClock, ClipboardList, Gauge, Inbox, LineChart, Package, Plus, Truck, Users, Wallet } from "lucide-react";
import { ListCardHeader, ROW_LINK, StatCard } from "@/components/patterns/stat-card";
import { TONE } from "@/components/patterns/tone";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReminderChip } from "@/components/patterns/status-chip";
import { MonthlyBarChart, MonthlyLineChart, Widget } from "@/app/(app)/dashboard/charts";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { daysFromNowISO, formatDate, formatNumber } from "@/lib/utils";
import { CompanyStatusChip, formatPrice, loadCompanyRows, monthlyPrice } from "./shared";
import { t } from "@/i18n";
import type { Tone } from "@/components/patterns/tone";

export default async function PlatformOverviewPage() {
  await requirePermission("platform.overview", "view");
  const supabase = await createClient();
  const [rows, { data: registrations }, { data: packages }, { data: issueRows }, { data: pkgRequests }] = await Promise.all([
    loadCompanyRows(supabase),
    supabase.from("company_registrations").select("id, company_name, contact_name, email, status, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("packages").select("id, name").is("deleted_at", null).order("sort_order"),
    supabase.rpc("platform_issues"),
    supabase.from("package_change_requests").select("id, company_id, from_package_id, to_package_id, created_at, company:companies(name)").eq("status", "pending").order("created_at"),
  ]);
  const packageName = new Map(((packages ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const changeRequests = (pkgRequests ?? []) as unknown as { id: string; company_id: string; from_package_id: string | null; to_package_id: string; created_at: string; company: { name: string } | null }[];
  const issues = (issueRows ?? []) as { company_id: string; company_name: string; issue: "no_admin" | "no_package" | "expired" | "suspended"; detail: string | null }[];

  const live = rows.filter((r) => r.status === "active" || r.status === "trial");
  const pending = ((registrations ?? []) as { status: string }[]).filter((r) => r.status === "pending").length;
  const { count: pendingTotal } = await supabase.from("company_registrations").select("id", { count: "exact", head: true }).eq("status", "pending");

  const mrr = new Map<string, number>();
  for (const r of live) {
    if (r.price === null || !r.billing_period) continue;
    const cur = r.currency ?? "TZS";
    mrr.set(cur, (mrr.get(cur) ?? 0) + monthlyPrice(Number(r.price), r.billing_period));
  }
  const in30 = daysFromNowISO(30);
  const today = daysFromNowISO(0);
  const expiring = rows.filter((r) => r.subscription_end && r.subscription_end <= in30 && r.status !== "cancelled").sort((a, b) => (a.subscription_end! < b.subscription_end! ? -1 : 1));
  const overLimit = rows.filter((r) => r.max_vehicles !== null && r.vehicles >= r.max_vehicles);

  const byPackage = ((packages ?? []) as { id: string; name: string }[]).map((p) => ({ label: p.name, count: live.filter((r) => r.package_id === p.id).length }));
  const months: string[] = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 11);
  for (let i = 0; i < 12; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  const growth = months.map((m) => ({ label: new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), companies: rows.filter((r) => r.created_at.slice(0, 7) === m).length }));

  const kpis = [
    { title: t("platform.kpi.companies"), value: formatNumber(live.length), sub: t("platform.kpi.companies_desc", { trial: rows.filter((r) => r.status === "trial").length, suspended: rows.filter((r) => r.status === "suspended").length }), href: "/platform/companies", icon: Building2, tone: "green" as Tone },
    { title: t("platform.kpi.registrations"), value: formatNumber(pendingTotal ?? pending), sub: (pendingTotal ?? 0) > 0 ? t("platform.kpi.registrations_waiting") : "", href: "/platform/registrations", icon: ClipboardList, tone: ((pendingTotal ?? 0) > 0 ? "amber" : "blue") as Tone },
    { title: t("platform.kpi.vehicles"), value: formatNumber(rows.reduce((s, r) => s + r.vehicles, 0)), sub: t("platform.kpi.vehicles_desc"), href: "/platform/companies", icon: Truck, tone: "purple" as Tone },
    { title: t("platform.kpi.users"), value: formatNumber(rows.reduce((s, r) => s + r.users, 0)), sub: "", href: "/platform/users", icon: Users, tone: "blue" as Tone },
    { title: t("platform.kpi.mrr"), value: mrr.size ? Array.from(mrr.entries()).map(([c, v]) => formatPrice(Math.round(v), c)).join(" + ") : formatPrice(0, "TZS"), sub: t("platform.kpi.mrr_desc"), href: "/platform/packages", icon: Wallet, tone: "green" as Tone },
    { title: t("platform.kpi.expiring"), value: formatNumber(expiring.filter((r) => r.subscription_end! >= today).length), sub: "", href: "#expiring", icon: CalendarClock, tone: "red" as Tone },
  ];

  return (
    <>
      <PageHeader
        title={t("platform.title")}
        description={t("platform.description")}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href="/platform/packages">
                <Package /> {t("platform.packages.title")}
              </Link>
            </Button>
            <Button asChild className="h-10">
              <Link href="/platform/companies/new">
                <Plus /> {t("platform.companies.new")}
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((k) => (
          <StatCard key={k.title} title={k.title} value={k.value} sub={k.sub} href={k.href} icon={k.icon} tone={k.tone} />
        ))}
      </div>

      {changeRequests.length ? (
        <Card className="pt-0 ring-[#d98b1f]/50">
          <span className={cn("h-1 w-full", TONE.amber.bar)} aria-hidden="true" />
          <ListCardHeader title={t("platform.package_request.list_title", { count: changeRequests.length })} icon={ArrowUpCircle} tone="amber" />
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {changeRequests.map((r) => (
                <li key={r.id}>
                  <Link href={`/platform/companies/${r.company_id}`} className={cn(ROW_LINK, "p-3 text-sm")}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.company?.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {(r.from_package_id ? packageName.get(r.from_package_id) : null) ?? t("platform.companies.no_package")} → {packageName.get(r.to_package_id) ?? ""} · {formatDate(r.created_at)}
                      </span>
                    </span>
                    <span className="status-chip status-chip-warning shrink-0">{t("platform.package_request.review")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className={cn("pt-0", issues.length && "ring-[#d98b1f]/50")}>
        <span className={cn("h-1 w-full", issues.length ? TONE.amber.bar : TONE.green.bar)} aria-hidden="true" />
        <ListCardHeader title={t("platform.issues.title")} icon={AlertTriangle} tone={issues.length ? "amber" : "green"} href="/platform/companies" />
        <CardContent>
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("platform.issues.none")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {issues.map((i) => (
                <li key={`${i.company_id}-${i.issue}`}>
                  <Link href={`/platform/companies/${i.company_id}`} className={cn(ROW_LINK, "p-3 text-sm")}>
                    <span className="min-w-0 truncate font-medium">{i.company_name}</span>
                    <span className={`status-chip shrink-0 ${i.issue === "no_admin" || i.issue === "no_package" ? "status-chip-warning" : "status-chip-danger"}`}>
                      {t(`platform.issues.${i.issue}`, { date: i.detail ? formatDate(i.detail) : "" })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Widget href="/platform/packages" icon={<Gauge />} tone="purple" title={t("platform.chart.by_package")} description={t("platform.chart.by_package_desc")} empty={byPackage.every((p) => p.count === 0)}>
          <MonthlyBarChart data={byPackage} series={[{ key: "count", label: t("platform.kpi.companies") }]} />
        </Widget>
        <Widget href="/platform/companies" icon={<LineChart />} tone="green" title={t("platform.chart.growth")} description={t("platform.chart.growth_desc")} empty={growth.every((g) => g.companies === 0)}>
          <MonthlyLineChart data={growth} series={[{ key: "companies", label: t("platform.companies.title") }]} />
        </Widget>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card id="expiring" className="scroll-mt-20">
          <ListCardHeader title={t("platform.lists.expiring")} icon={CalendarClock} tone="red" href="/platform/companies" />
          <CardContent className="space-y-2 text-sm">
            {expiring.length === 0 ? <p className="text-muted-foreground">{t("platform.lists.none")}</p> : null}
            {expiring.slice(0, 8).map((r) => (
              <Link key={r.id} href={`/platform/companies/${r.id}`} className={ROW_LINK}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.package_name ?? t("platform.companies.no_package")} · {formatDate(r.subscription_end)}
                  </span>
                </span>
                <ReminderChip date={r.subscription_end} />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <ListCardHeader title={t("platform.lists.over_limit")} icon={Truck} tone="amber" href="/platform/companies" />
          <CardContent className="space-y-2 text-sm">
            {overLimit.length === 0 ? <p className="text-muted-foreground">{t("platform.lists.none")}</p> : null}
            {overLimit.map((r) => (
              <Link key={r.id} href={`/platform/companies/${r.id}`} className={ROW_LINK}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{r.package_name}</span>
                </span>
                <span className="status-chip status-chip-warning tabular-nums">
                  {r.vehicles} / {r.max_vehicles}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <ListCardHeader title={t("platform.lists.registrations")} icon={ClipboardList} tone="blue" href="/platform/registrations" />
          <CardContent className="space-y-2 text-sm">
            {(registrations ?? []).length === 0 ? <p className="text-muted-foreground">{t("platform.lists.none")}</p> : null}
            {((registrations ?? []) as { id: string; company_name: string; contact_name: string; status: string; created_at: string }[]).map((r) => (
              <Link key={r.id} href="/platform/registrations" className={ROW_LINK}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.company_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.contact_name} · {formatDate(r.created_at)}
                  </span>
                </span>
                <span className={`status-chip ${r.status === "pending" ? "status-chip-warning" : r.status === "approved" ? "status-chip-success" : "status-chip-danger"}`}>{t(`platform.registrations.status.${r.status}`)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <ListCardHeader title={t("platform.companies.title")} icon={Building2} tone="green" href="/platform/companies" />
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("platform.companies.name")}</th>
                <th className="py-2 pr-3 font-medium">{t("platform.companies.package")}</th>
                <th className="py-2 pr-3 font-medium">{t("platform.companies.status")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("platform.companies.vehicles")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("platform.companies.users")}</th>
                <th className="py-2 font-medium">{t("platform.companies.subscription_end")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((r) => (
                <tr key={r.id} className="group relative border-t transition-colors hover:bg-primary/5">
                  <td className="py-2 pr-3">
                    <Link href={`/platform/companies/${r.id}`} className="font-medium text-primary underline-offset-4 after:absolute after:inset-0 group-hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{r.package_name ?? t("platform.companies.no_package")}</td>
                  <td className="py-2 pr-3">
                    <CompanyStatusChip status={r.status} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {r.vehicles}
                    {r.max_vehicles ? ` / ${r.max_vehicles}` : ""}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.users}</td>
                  <td className="py-2 pr-2">{r.subscription_end ? <ReminderChip date={r.subscription_end} /> : <span className="text-muted-foreground">{t("subscription.no_end")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Inbox className="size-4" aria-hidden="true" /> {t("platform.lists.none")}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
