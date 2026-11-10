"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { t } from "@/i18n";

/** Stacked horizontal bar: valid, due soon, overdue per compliance item. */
export function ComplianceBars({ data }: { data: { label: string; valid: number; due_soon: number; overdue: number }[] }) {
  const config: ChartConfig = {
    valid: { label: t("status.valid"), color: "var(--success)" },
    due_soon: { label: t("status.due_soon"), color: "var(--chart-3)" },
    overdue: { label: t("status.overdue"), color: "var(--danger)" },
  };
  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={12} width={110} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="valid" stackId="a" fill="var(--color-valid)" />
        <Bar dataKey="due_soon" stackId="a" fill="var(--color-due_soon)" />
        <Bar dataKey="overdue" stackId="a" fill="var(--color-overdue)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
