"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { DatePicker } from "@/components/patterns/date-picker";
import { saveRecord } from "@/lib/data/records";
import { formatNumber, formatTzs } from "@/lib/utils";
import { t } from "@/i18n";

/** Fuel log manager view: previous fill, balance, odometers, issued litres, price and the computed cost. */
export function FuelIssueForm({ request, issue, vehicle, readOnly }: { request: Record<string, unknown>; issue: Record<string, unknown> | null; vehicle: Record<string, unknown> | null; readOnly: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState({
    issue_date: (issue?.issue_date as string) ?? new Date().toISOString().slice(0, 10),
    previous_filled_l: String(issue?.previous_filled_l ?? request.fuel_filled_l ?? ""),
    balance_l: String(issue?.balance_l ?? ""),
    previous_odometer: String(issue?.previous_odometer ?? request.previous_odometer ?? ""),
    current_odometer: String(issue?.current_odometer ?? request.current_odometer ?? ""),
    fuel_filled_l: String(issue?.fuel_filled_l ?? request.fuel_filled_l ?? ""),
    fuel_issued_l: String(issue?.fuel_issued_l ?? request.approved_l ?? request.fuel_required_l ?? ""),
    price_per_litre: String(issue?.price_per_litre ?? ""),
  });
  const [busy, setBusy] = React.useState(false);

  const kmRun = Number(v.current_odometer) - Number(v.previous_odometer);
  const issued = Number(v.fuel_issued_l);
  const ratio = issued > 0 && !Number.isNaN(kmRun) ? kmRun / issued : null;
  const cost = issued > 0 && Number(v.price_per_litre) > 0 ? issued * Number(v.price_per_litre) : null;

  async function save() {
    setBusy(true);
    const res = await saveRecord({
      table: "fuel_issues",
      id: (issue?.id as string) ?? null,
      values: {
        fuel_request_id: request.id,
        vehicle_id: request.vehicle_id,
        driver_id: request.driver_id,
        issue_date: v.issue_date,
        previous_filled_l: v.previous_filled_l === "" ? null : Number(v.previous_filled_l),
        balance_l: v.balance_l === "" ? null : Number(v.balance_l),
        previous_odometer: v.previous_odometer === "" ? null : Number(v.previous_odometer),
        current_odometer: v.current_odometer === "" ? null : Number(v.current_odometer),
        fuel_filled_l: v.fuel_filled_l === "" ? null : Number(v.fuel_filled_l),
        fuel_issued_l: Number(v.fuel_issued_l),
        price_per_litre: v.price_per_litre === "" ? 0 : Number(v.price_per_litre),
      },
      revalidate: ["/daily-use/fuel-log", "/expenses/fuel"],
    });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("common.saved"));
      router.refresh();
    }
  }

  const field = (key: keyof typeof v, label: string, unit?: string) => (
    <Field>
      <FieldLabel htmlFor={`fi-${key}`}>{t(label)}</FieldLabel>
      <div className="relative">
        <Input id={`fi-${key}`} type="number" inputMode="decimal" step="any" className="h-10 pr-12" value={v[key]} disabled={readOnly} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
        {unit ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span> : null}
      </div>
    </Field>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="fi-date">{t("daily_use.fuel.issued_on")}</FieldLabel>
          <DatePicker id="fi-date" value={v.issue_date} onChange={(d) => setV({ ...v, issue_date: d ?? "" })} disabled={readOnly} />
        </Field>
        <Field>
          <FieldLabel>{t("daily_use.fuel.tank_capacity")}</FieldLabel>
          <div className="flex h-10 items-center rounded-lg border bg-muted/50 px-3 text-sm">{vehicle?.fuel_tank_capacity_l ? `${formatNumber(vehicle.fuel_tank_capacity_l as number, 0)} L` : "—"}</div>
        </Field>
        {field("previous_filled_l", "daily_use.fuel.previous_filled", "L")}
        {field("balance_l", "daily_use.fuel.balance", "L")}
        {field("previous_odometer", "daily_use.fuel.previous_odometer", "km")}
        {field("current_odometer", "daily_use.fuel.current_odometer", "km")}
        {field("fuel_filled_l", "daily_use.fuel.fuel_filled", "L")}
        {field("fuel_issued_l", "daily_use.fuel.issued", "L")}
        {field("price_per_litre", "daily_use.fuel.price", "TZS")}
      </div>
      <dl className="grid gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t("daily_use.fuel.km_run")}</dt>
          <dd className="font-medium tabular-nums">{Number.isNaN(kmRun) ? "—" : `${formatNumber(kmRun, 1)} km`}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("daily_use.fuel.consumption")}</dt>
          <dd className="font-medium tabular-nums">{ratio === null ? "—" : `${formatNumber(ratio, 2)} km/L`}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("daily_use.fuel.total_cost")}</dt>
          <dd className="font-medium tabular-nums">{cost === null ? "—" : formatTzs(cost)}</dd>
        </div>
      </dl>
      {!readOnly ? (
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy || !v.fuel_issued_l}>
            {busy ? t("common.saving") : t("daily_use.fuel.issue")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
