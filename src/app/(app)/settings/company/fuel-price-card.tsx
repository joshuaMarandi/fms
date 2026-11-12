"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Fuel, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/patterns/date-picker";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatTzs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

export type FuelPrice = { id: string; price_per_litre: number; effective_from: string; note: string | null; engine_type: string };

const ENGINES = ["all", "diesel", "petrol", "gas", "electric"] as const;
const unitOf = (e: string) => (e === "electric" ? "kWh" : "L");

/**
 * Monthly fuel price kept by the admin, per engine type. The newest price on or before a date is used
 * for that date; a vehicle without its own engine type price uses the price for all engine types.
 */
export function FuelPriceCard({ companyId, prices, canEdit }: { companyId: string; prices: FuelPrice[]; canEdit: boolean }) {
  const router = useRouter();
  const today = todayISO();
  const currentOf = (e: string) => prices.find((p) => (p.engine_type ?? "all") === e && p.effective_from <= today) ?? null;
  const currentIds = new Set(ENGINES.map((e) => currentOf(e)?.id).filter(Boolean) as string[]);
  const [engine, setEngine] = React.useState<string>("all");
  const [price, setPrice] = React.useState("");
  const [from, setFrom] = React.useState<string | null>(() => todayISO());
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(price);
    if (!value || value <= 0 || !from) {
      toast.error(t("form.fix_errors"));
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("fuel_prices")
      .upsert({ company_id: companyId, engine_type: engine, price_per_litre: value, effective_from: from, note: note.trim() || null, deleted_at: null }, { onConflict: "company_id,engine_type,effective_from" });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("settings.fuel.added"));
    setPrice("");
    setNote("");
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("fuel_prices").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fuel className="size-4 text-primary" aria-hidden="true" /> {t("settings.fuel.title")}
        </CardTitle>
        <CardDescription>{t("settings.fuel.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("settings.fuel.current")}</p>
          {ENGINES.map((e) => {
            const c = currentOf(e);
            if (!c && e !== "all") return null;
            return (
              <div key={e} className="rounded-xl bg-primary/5 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">{t(`engine.${e}`)}</p>
                {c ? (
                  <>
                    <p className="text-2xl font-semibold tabular-nums">{formatTzs(c.price_per_litre)}</p>
                    <p className="text-xs text-muted-foreground">/ {unitOf(e)} · {t("settings.fuel.since", { date: formatDate(c.effective_from) })}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm">{t("settings.fuel.none")}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          {canEdit ? (
            <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.2fr_auto] lg:items-end">
              <Field>
                <FieldLabel htmlFor="fp-engine">{t("settings.fuel.engine_type")}</FieldLabel>
                <Select value={engine} onValueChange={setEngine}>
                  <SelectTrigger id="fp-engine" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENGINES.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`engine.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="fp-price">{t("settings.fuel.new_price")}</FieldLabel>
                <Input id="fp-price" type="number" inputMode="decimal" min={1} step="0.01" className="h-10" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="fp-from">{t("settings.fuel.effective_from")}</FieldLabel>
                <DatePicker id="fp-from" value={from} onChange={setFrom} />
              </Field>
              <Field>
                <FieldLabel htmlFor="fp-note">{t("settings.fuel.note")}</FieldLabel>
                <Input id="fp-note" className="h-10" value={note} placeholder={t("settings.fuel.note_placeholder")} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button type="submit" className="h-10" disabled={busy}>
                <Plus /> {t("settings.fuel.add")}
              </Button>
            </form>
          ) : null}

          {prices.length ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("settings.fuel.history")}</p>
              <ul className="divide-y rounded-lg border text-sm">
                {prices.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-28 shrink-0 text-muted-foreground">{formatDate(p.effective_from)}</span>
                    <span className="w-24 shrink-0 text-xs">{t(`engine.${p.engine_type ?? "all"}`)}</span>
                    <span className="font-medium tabular-nums">
                      {formatTzs(p.price_per_litre)} <span className="text-xs font-normal text-muted-foreground">/ {unitOf(p.engine_type ?? "all")}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.note}</span>
                    {currentIds.has(p.id) ? <span className="status-chip status-chip-success">{t("settings.fuel.current")}</span> : null}
                    {canEdit ? (
                      <ConfirmDialog
                        trigger={
                          <Button type="button" variant="ghost" size="icon" className="size-8 text-danger" aria-label={t("settings.fuel.remove")}>
                            <Trash2 />
                          </Button>
                        }
                        description={t("common.confirm_delete")}
                        destructive
                        confirmLabel={t("common.delete")}
                        onConfirm={() => remove(p.id)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
