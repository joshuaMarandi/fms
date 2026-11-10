import Link from "next/link";
import { Building2, Inbox, Package, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReminderChip } from "@/components/patterns/status-chip";
import { MonthlyBarChart, MonthlyLineChart, Widget } from "@/app/(app)/dashboard/charts";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { daysFromNowISO, formatDate, formatNumber } from "@/lib/utils";
import { CompanyStatusChip, formatPrice, loadCompanyRows, monthlyPrice } from "./shared";
import { t } from "@/i18n";

export default async function PlatformOverviewPage() {
  await requirePermission("platform.overview", "view");
  const supabase = await createClient();
  const [rows, { data: registrations }, { data: packages }] = await Promise.all([
    loadCompanyRows(supabase),
    supabase.from("company_registrations").select("id, company_name, contact_name, email, status, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("packages").select("id, name").is("deleted_at", null).order("sort_order"),
  ]);

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
    { title: t("platform.kpi.companies"), value: formatNumber(live.length), sub: t("platform.kpi.companies_desc", { trial: rows.filter((r) => r.status === "trial").length, suspended: rows.filter((r) => r.status === "suspended").length }), href: "/platform/companies" },
    { title: t("platform.kpi.registrations"), value: formatNumber(pendingTotal ?? pending), sub: "", href: "/platform/registrations", tone: (pendingTotal ?? 0) > 0 },
    { title: t("platform.kpi.vehicles"), value: formatNumber(rows.reduce((s, r) => s + r.vehicles, 0)), sub: t("platform.kpi.vehicles_desc") },
    { title: t("platform.kpi.users"), value: formatNumber(rows.reduce((s, r) => s + r.users, 0)), sub: "" },
    { title: t("platform.kpi.mrr"), value: mrr.size ? Array.from(mrr.entries()).map(([c, v]) => formatPrice(Math.round(v), c)).join(" + ") : formatPrice(0, "TZS"), sub: t("platform.kpi.mrr_desc") },
    { title: t("platform.kpi.expiring"), value: formatNumber(expiring.filter((r) => r.subscription_end! >= today).length), sub: "" },
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
          <Card key={k.title} className={k.tone ? "border-warning/50" : undefined}>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">{k.title}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{k.href ? <Link href={k.href} className="hover:underline">{k.value}</Link> : k.value}</CardTitle>
            </CardHeader>
            {k.sub ? (
              <CardContent>
                <p className="text-xs text-muted-foreground">{k.sub}</p>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Widget title={t("platform.chart.by_package")} description={t("platform.chart.by_package_desc")} empty={byPackage.every((p) => p.count === 0)}>
          <MonthlyBarChart data={byPackage} series={[{ key: "count", label: t("platform.kpi.companies") }]} />
        </Widget>
        <Widget title={t("platform.chart.growth")} description={t("platform.chart.growth_desc")} empty={growth.every((g) => g.companies === 0)}>
          <MonthlyLineChart data={growth} series={[{ key: "companies", label: t("platform.companies.title") }]} />
        </Widget>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("platform.lists.expiring")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {expiring.length === 0 ? <p className="text-muted-foreground">{t("platform.lists.none")}</p> : null}
            {expiring.slice(0, 8).map((r) => (
              <Link key={r.id} href={`/platform/companies/${r.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-muted/40">
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
          <CardHeader>
            <CardTitle className="text-base">{t("platform.lists.over_limit")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overLimit.length === 0 ? <p className="text-muted-foreground">{t("platform.lists.none")}</p> : null}
            {overLimit.map((r) => (
              <Link key={r.id} href={`/platform/companies/${r.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-muted/40">
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
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {t("platform.lists.registrations")}
              <Link href="/platform/registrations" className="text-xs font-normal text-primary underline-offset-4 hover:underline">
                {t("nav.view_all")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(registrations ?? []).length === 0 ? <p className="text-muted-foreground">{t("platform.lists.none")}</p> : null}
            {((registrations ?? []) as { id: string; company_name: string; contact_name: string; status: string; created_at: string }[]).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.company_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.contact_name} · {formatDate(r.created_at)}
                  </span>
                </span>
                <span className={`status-chip ${r.status === "pending" ? "status-chip-warning" : r.status === "approved" ? "status-chip-success" : "status-chip-danger"}`}>{t(`platform.registrations.status.${r.status}`)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Building2 className="size-4" aria-hidden="true" /> {t("platform.companies.title")}
            </span>
            <Link href="/platform/companies" className="text-xs font-normal text-primary underline-offset-4 hover:underline">
              {t("nav.view_all")}
            </Link>
          </CardTitle>
        </CardHeader>
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
                <tr key={r.id} className="border-t">
                  <td className="py-2 pr-3">
                    <Link href={`/platform/companies/${r.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
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
                  <td className="py-2">{r.subscription_end ? <ReminderChip date={r.subscription_end} /> : <span className="text-muted-foreground">{t("subscription.no_end")}</span>}</td>
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
