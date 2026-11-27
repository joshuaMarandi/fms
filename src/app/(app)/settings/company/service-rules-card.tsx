"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { VEHICLE_TYPES } from "@/lib/vehicle-types";
import { formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

export type ServiceRule = { id: string; vehicle_type: string | null; make: string | null; model: string | null; engine_type: string | null; interval_km: number | null; interval_months: number | null; notes: string | null };
type Vehicle = { id: string; make: string; model: string; vehicle_type: string | null; engine_type: string | null };

const ENGINES = ["diesel", "petrol", "electric", "gas"] as const;
const ANY = "__any";
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** How specific a rule is (model, then make, then type, then engine), as the database picks it. */
const score = (r: ServiceRule) => (r.model ? 8 : 0) + (r.make ? 4 : 0) + (r.vehicle_type ? 2 : 0) + (r.engine_type ? 1 : 0);
const matches = (r: ServiceRule, v: Vehicle) =>
  (!r.vehicle_type || r.vehicle_type === v.vehicle_type) && (!r.make || same(r.make, v.make)) && (!r.model || same(r.model, v.model)) && (!r.engine_type || r.engine_type === v.engine_type);

/**
 * Service intervals by vehicle type, make, model and engine, from the company documentation. Each
 * vehicle follows the most specific rule that matches it (the count shows how many do).
 */
export function ServiceRulesCard({ companyId, rules, vehicles, canEdit, canDelete }: { companyId: string; rules: ServiceRule[]; vehicles: Vehicle[]; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<ServiceRule | "new" | null>(null);

  // Vehicles each rule applies to (the most specific rule wins).
  const applies = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vehicles) {
      const best = rules.filter((r) => matches(r, v)).sort((a, b) => score(b) - score(a))[0];
      if (best) m.set(best.id, (m.get(best.id) ?? 0) + 1);
    }
    return m;
  }, [rules, vehicles]);
  const sorted = [...rules].sort((a, b) => score(a) - score(b) || (a.vehicle_type ?? "").localeCompare(b.vehicle_type ?? "") || (a.make ?? "").localeCompare(b.make ?? ""));
  const makes = [...new Set(vehicles.map((v) => v.make.trim()).filter(Boolean))].sort();
  const models = [...new Set(vehicles.map((v) => v.model.trim()).filter(Boolean))].sort();

  async function remove(r: ServiceRule) {
    const { error } = await createClient().from("service_interval_rules").update({ deleted_at: new Date().toISOString() }).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("settings.service_rules.deleted"));
    router.refresh();
  }

  const any = <span className="text-muted-foreground">{t("settings.service_rules.any")}</span>;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="size-4" aria-hidden="true" /> {t("settings.service_rules.title")}
          </CardTitle>
          <CardDescription className="max-w-3xl">{t("settings.service_rules.description")}</CardDescription>
        </div>
        {canEdit ? (
          <Button type="button" className="h-10" onClick={() => setEditing("new")}>
            <Plus /> {t("settings.service_rules.add")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.service_rules.none")}</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">{t("fleet.vehicle_type")}</th>
                <th className="py-2 pr-3 font-medium">{t("fleet.make")}</th>
                <th className="py-2 pr-3 font-medium">{t("fleet.model")}</th>
                <th className="py-2 pr-3 font-medium">{t("fleet.engine_type")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("settings.service_rules.km")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("settings.service_rules.months")}</th>
                <th className="py-2 pr-3 font-medium">{t("fleet.title")}</th>
                <th className="py-2">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{r.vehicle_type ? t(`vehicle_type.${r.vehicle_type}`) : any}</td>
                  <td className="py-2 pr-3">{r.make ?? any}</td>
                  <td className="py-2 pr-3">{r.model ?? any}</td>
                  <td className="py-2 pr-3">{r.engine_type ? t(`engine.${r.engine_type}`) : any}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.interval_km ? formatNumber(Number(r.interval_km)) : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.interval_months ?? "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{t("settings.service_rules.applies", { count: applies.get(r.id) ?? 0 })}</td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {canEdit ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(r)}>
                        <Pencil /> {t("common.edit")}
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <ConfirmDialog
                        trigger={
                          <Button type="button" variant="ghost" size="sm" className="text-danger" aria-label={t("common.delete")}>
                            <Trash2 />
                          </Button>
                        }
                        description={t("common.confirm_delete")}
                        destructive
                        confirmLabel={t("common.delete")}
                        onConfirm={() => remove(r)}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      <RuleDialog key={editing === "new" ? "new" : (editing?.id ?? "none")} rule={editing} companyId={companyId} makes={makes} models={models} onClose={() => setEditing(null)} />
    </Card>
  );
}

function RuleDialog({ rule, companyId, makes, models, onClose }: { rule: ServiceRule | "new" | null; companyId: string; makes: string[]; models: string[]; onClose: () => void }) {
  const router = useRouter();
  const r = rule && rule !== "new" ? rule : null;
  const [type, setType] = React.useState(r?.vehicle_type ?? ANY);
  const [make, setMake] = React.useState(r?.make ?? "");
  const [model, setModel] = React.useState(r?.model ?? "");
  const [engine, setEngine] = React.useState(r?.engine_type ?? ANY);
  const [km, setKm] = React.useState(r?.interval_km ? String(r.interval_km) : "");
  const [months, setMonths] = React.useState(r?.interval_months ? String(r.interval_months) : "");
  const [notes, setNotes] = React.useState(r?.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  if (!rule) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const kmN = km.trim() ? Number(km) : null;
    const monthsN = months.trim() ? Math.round(Number(months)) : null;
    if ((kmN === null || !(kmN > 0)) && (monthsN === null || !(monthsN > 0))) {
      toast.error(t("settings.service_rules.need_interval"));
      return;
    }
    setBusy(true);
    const values = {
      vehicle_type: type === ANY ? null : type,
      make: make.trim() || null,
      model: model.trim() || null,
      engine_type: engine === ANY ? null : engine,
      interval_km: kmN && kmN > 0 ? kmN : null,
      interval_months: monthsN && monthsN > 0 ? monthsN : null,
      notes: notes.trim() || null,
    };
    const supabase = createClient();
    const { error } = r ? await supabase.from("service_interval_rules").update(values).eq("id", r.id) : await supabase.from("service_interval_rules").insert({ ...values, company_id: companyId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("settings.service_rules.saved"));
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{r ? t("settings.service_rules.edit") : t("settings.service_rules.add")}</DialogTitle>
          <DialogDescription>{t("settings.service_rules.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-type" className="mb-1 block text-sm font-medium">{t("fleet.vehicle_type")}</label>
            <Select value={type} onValueChange={(v) => setType(v ?? ANY)}>
              <SelectTrigger id="rule-type" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("settings.service_rules.any")}</SelectItem>
                {VEHICLE_TYPES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`vehicle_type.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="rule-engine" className="mb-1 block text-sm font-medium">{t("fleet.engine_type")}</label>
            <Select value={engine} onValueChange={(v) => setEngine(v ?? ANY)}>
              <SelectTrigger id="rule-engine" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("settings.service_rules.any")}</SelectItem>
                {ENGINES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`engine.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="rule-make" className="mb-1 block text-sm font-medium">{t("fleet.make")}</label>
            <Input id="rule-make" className="h-10" list="rule-makes" value={make} onChange={(e) => setMake(e.target.value)} placeholder={t("settings.service_rules.any")} />
            <datalist id="rule-makes">
              {makes.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="rule-model" className="mb-1 block text-sm font-medium">{t("fleet.model")}</label>
            <Input id="rule-model" className="h-10" list="rule-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("settings.service_rules.any")} />
            <datalist id="rule-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="rule-km" className="mb-1 block text-sm font-medium">{t("settings.service_rules.km")}</label>
            <Input id="rule-km" className="h-10" type="number" min={1} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rule-months" className="mb-1 block text-sm font-medium">{t("settings.service_rules.months")}</label>
            <Input id="rule-months" className="h-10" type="number" min={1} max={60} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="rule-notes" className="mb-1 block text-sm font-medium">{t("settings.service_rules.notes")}</label>
            <Input id="rule-notes" className="h-10" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
