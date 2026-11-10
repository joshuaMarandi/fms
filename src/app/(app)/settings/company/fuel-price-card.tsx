"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Fuel, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { DatePicker } from "@/components/patterns/date-picker";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatTzs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

export type FuelPrice = { id: string; price_per_litre: number; effective_from: string; note: string | null };

/** Monthly fuel price kept by the admin. The newest price on or before a date is used for that date. */
export function FuelPriceCard({ companyId, prices, canEdit }: { companyId: string; prices: FuelPrice[]; canEdit: boolean }) {
  const router = useRouter();
  const today = todayISO();
  const current = prices.find((p) => p.effective_from <= today) ?? null;
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
      .upsert({ company_id: companyId, price_per_litre: value, effective_from: from, note: note.trim() || null, deleted_at: null }, { onConflict: "company_id,effective_from" });
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
        <div className="rounded-xl bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">{t("settings.fuel.current")}</p>
          {current ? (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{formatTzs(current.price_per_litre)}</p>
              <p className="text-sm text-muted-foreground">/ L · {t("settings.fuel.since", { date: formatDate(current.effective_from) })}</p>
            </>
          ) : (
            <p className="mt-1 text-sm">{t("settings.fuel.none")}</p>
          )}
        </div>

        <div className="space-y-4">
          {canEdit ? (
            <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
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
                    <span className="font-medium tabular-nums">{formatTzs(p.price_per_litre)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.note}</span>
                    {current?.id === p.id ? <span className="status-chip status-chip-success">{t("settings.fuel.current")}</span> : null}
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
