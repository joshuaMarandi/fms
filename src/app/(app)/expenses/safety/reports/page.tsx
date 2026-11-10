import { PageHeader } from "@/components/shell/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyLineChart, Widget } from "@/app/(app)/dashboard/charts";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

export default async function SafetyReportsPage() {
  await requirePermission("expenses.safety.reports", "view");
  const supabase = await createClient();
  const { data } = await supabase.from("v_incident_totals").select("*").order("month");
  const rows = (data ?? []) as { month: string; incidents: number; injuries: number; fatalities: number }[];
  const totals = rows.reduce((acc, r) => ({ incidents: acc.incidents + Number(r.incidents), injuries: acc.injuries + Number(r.injuries), fatalities: acc.fatalities + Number(r.fatalities) }), { incidents: 0, injuries: 0, fatalities: 0 });
  const series = rows.map((r) => ({ label: new Date(r.month).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), incidents: Number(r.incidents), injuries: Number(r.injuries), fatalities: Number(r.fatalities) }));

  return (
    <>
      <PageHeader title={t("expenses.safety.reports.title")} description={t("expenses.safety.reports.description")} />
      <div className="grid gap-4 sm:grid-cols-3">
        {(["incidents", "injuries", "fatalities"] as const).map((k) => (
          <Card key={k}>
            <CardHeader>
              <CardDescription>{t(`expenses.safety.total_${k}`)}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{formatNumber(totals[k])}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Widget title={t("dashboard.chart.incidents")} description={t("dashboard.chart.incidents_desc")} empty={series.length === 0}>
        <MonthlyLineChart data={series} series={[{ key: "incidents", label: t("dashboard.series.incidents") }, { key: "injuries", label: t("dashboard.series.injuries") }, { key: "fatalities", label: t("dashboard.series.fatalities") }]} />
      </Widget>
    </>
  );
}
