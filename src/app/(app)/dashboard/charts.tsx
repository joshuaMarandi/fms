"use client";

import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Line, LineChart, Pie, PieChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatTzs } from "@/lib/utils";
import { t } from "@/i18n";

export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

export function Widget({ title, description, children, empty, className }: { title: string; description: string; children: React.ReactNode; empty?: boolean; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{empty ? <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">{t("dashboard.no_data")}</p> : children}</CardContent>
    </Card>
  );
}

export function WidgetSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[220px] w-full" />
      </CardContent>
    </Card>
  );
}

const grid = <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />;

export function MonthlyLineChart({ data, series, unit }: { data: Record<string, unknown>[]; series: { key: string; label: string }[]; unit?: "tzs" | "number" }) {
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: SERIES[i % SERIES.length] }]));
  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <LineChart data={data} margin={{ left: 8, right: 8 }}>
        {grid}
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => (unit === "tzs" ? compact(v) : formatNumber(v))} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => [unit === "tzs" ? formatTzs(v as number) : formatNumber(v as number, 1), config[String(name)]?.label as string]} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} stroke={`var(--color-${s.key})`} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

export function MonthlyBarChart({ data, series, stacked, unit, horizontal }: { data: Record<string, unknown>[]; series: { key: string; label: string }[]; stacked?: boolean; unit?: "tzs" | "number"; horizontal?: boolean }) {
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: SERIES[i % SERIES.length] }]));
  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 8, right: 8 }}>
        {grid}
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={12} width={90} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => (unit === "tzs" ? compact(v) : formatNumber(v))} />
          </>
        )}
        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => [unit === "tzs" ? formatTzs(v as number) : formatNumber(v as number, 1), config[String(name)]?.label as string]} />} />
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} stackId={stacked ? "a" : undefined} radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** Horizontal bars with a target marker per row (consumption attained against target). */
export function TargetBarChart({ data }: { data: { label: string; attained: number; target: number | null }[] }) {
  const config: ChartConfig = { attained: { label: t("dashboard.series.attained"), color: SERIES[0] }, target: { label: t("dashboard.series.target"), color: SERIES[2] } };
  const maxTarget = Math.max(...data.map((d) => d.target ?? 0), 0);
  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        {grid}
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} domain={[0, Math.ceil(Math.max(maxTarget, ...data.map((d) => d.attained)) * 1.15) || 1]} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={12} width={90} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => [`${formatNumber(v as number, 2)} km/L`, config[String(name)]?.label as string]} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="attained" fill="var(--color-attained)" radius={[0, 4, 4, 0]} />
        <Bar dataKey="target" fill="var(--color-target)" barSize={3} />
      </BarChart>
    </ChartContainer>
  );
}

export function SimpleAreaChart({ data, dataKey, label }: { data: Record<string, unknown>[]; dataKey: string; label: string }) {
  const config: ChartConfig = { [dataKey]: { label, color: SERIES[1] } };
  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <AreaChart data={data} margin={{ left: 8, right: 8 }}>
        {grid}
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area type="monotone" dataKey={dataKey} stroke={`var(--color-${dataKey})`} fill={`var(--color-${dataKey})`} fillOpacity={0.25} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}

export function DonutChart({ data, unit }: { data: { key: string; label: string; value: number }[]; unit?: "tzs" | "number" }) {
  const config: ChartConfig = Object.fromEntries(data.map((d, i) => [d.key, { label: d.label, color: SERIES[i % SERIES.length] }]));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ChartContainer config={config} className="mx-auto h-[240px] w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" formatter={(v, name) => [unit === "tzs" ? formatTzs(v as number) : formatNumber(v as number), config[String(name)]?.label as string]} />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={60} outerRadius={90} strokeWidth={2} stroke="var(--card)">
          {data.map((d) => (
            <Cell key={d.key} fill={`var(--color-${d.key})`} />
          ))}
          <Label content={({ viewBox }) => {
            const vb = viewBox as { cx?: number; cy?: number } | undefined;
            if (!vb?.cx || !vb?.cy) return null;
            return (
              <text x={vb.cx} y={vb.cy} textAnchor="middle" dominantBaseline="middle" className="fill-foreground">
                <tspan x={vb.cx} y={vb.cy - 6} className="text-lg font-semibold">{unit === "tzs" ? compact(total) : formatNumber(total)}</tspan>
                <tspan x={vb.cx} y={vb.cy + 14} className="fill-muted-foreground text-xs">{t("common.total")}</tspan>
              </text>
            );
          }} />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
      </PieChart>
    </ChartContainer>
  );
}

export function Sparkline({ data, dataKey = "v", color = SERIES[0] }: { data: Record<string, number | string>[]; dataKey?: string; color?: string }) {
  if (data.length < 2) return <div className="h-8" />;
  return (
    <ChartContainer config={{ [dataKey]: { label: "", color } }} className="h-8 w-full">
      <LineChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}

export function ZeroLine() {
  return <ReferenceLine y={0} stroke="var(--border)" />;
}

function compact(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}
