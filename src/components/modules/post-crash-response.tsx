"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleDot, Lock, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusChip } from "@/components/patterns/status-chip";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { callRpc } from "@/lib/data/records";
import { PCR_STEPS, pcrApplies, type PcrField, type PcrStep } from "@/lib/post-crash";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

export type PcrStepRow = { id: string; step: string; status: "open" | "closed"; details: Record<string, unknown>; opened_at: string; closed_at: string | null };

const tl = (k: string) => (hasKey(k) ? t(k) : k);

/**
 * Post-crash response, step by step (I to V): each step is opened, filled in (with its documents) and
 * closed, and the next step opens only after the one before it is closed.
 */
export function PostCrashResponse({ incidentId, injuries, fatalities, steps, canWork, path }: { incidentId: string; injuries: number; fatalities: number; steps: PcrStepRow[]; canWork: boolean; path: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ def: PcrStep; row: PcrStepRow } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const byKey = new Map(steps.map((s) => [s.step, s]));
  const revalidate = [path, `${path}/${incidentId}`];

  async function open(def: PcrStep) {
    setBusy(def.key);
    const res = await callRpc<string>("incident_step_open", { p_incident: incidentId, p_step: def.key }, revalidate);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setEditing({ def, row: { id: res.data, step: def.key, status: "open", details: byKey.get(def.key)?.details ?? {}, opened_at: new Date().toISOString(), closed_at: null } });
    router.refresh();
  }
  async function reopen(row: PcrStepRow) {
    setBusy(row.step);
    const res = await callRpc<boolean>("incident_step_reopen", { p_id: row.id }, revalidate);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(t("pcr.reopened"));
    router.refresh();
  }

  const closedCount = steps.filter((s) => s.status === "closed").length;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">{t("pcr.title")}</CardTitle>
        <CardDescription>{t("pcr.hint")}</CardDescription>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border px-3 py-1.5">
            {t("expenses.safety.injuries_count")}: <span className="font-semibold tabular-nums">{formatNumber(injuries)}</span>
          </span>
          <span className={cn("rounded-lg border px-3 py-1.5", fatalities ? "border-danger/40 bg-danger-bg text-danger" : "")}>
            {t("expenses.safety.fatalities_count")}: <span className="font-semibold tabular-nums">{formatNumber(fatalities)}</span>
          </span>
          <span className="rounded-lg border px-3 py-1.5">{t("pcr.progress", { done: closedCount, total: PCR_STEPS.length })}</span>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {PCR_STEPS.map((def, i) => {
            const row = byKey.get(def.key);
            const prevClosed = i === 0 || byKey.get(PCR_STEPS[i - 1]!.key)?.status === "closed";
            const nextStarted = PCR_STEPS.slice(i + 1).some((x) => byKey.has(x.key));
            const state = row?.status === "closed" ? "closed" : row ? "open" : prevClosed ? "ready" : "locked";
            return (
              <li key={def.key} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3", state === "closed" && "border-success/40 bg-success-bg/40", state === "open" && "border-warning/50", state === "locked" && "opacity-60")}>
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", state === "closed" ? "bg-success text-white" : state === "open" ? "bg-warning-bg text-warning" : "bg-muted text-muted-foreground")}>{def.numeral}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t(def.title)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row?.status === "closed" && row.closed_at
                      ? t("pcr.closed_on", { date: formatDate(row.closed_at, true) })
                      : row
                        ? t("pcr.opened_on", { date: formatDate(row.opened_at, true) })
                        : state === "locked"
                          ? t("pcr.after_previous", { step: PCR_STEPS[i - 1]!.numeral })
                          : t(def.hint)}
                  </span>
                </span>
                <StatusChip
                  status={state}
                  tone={state === "closed" ? "success" : state === "open" ? "warning" : "neutral"}
                  label={state === "closed" ? t("pcr.state.closed") : state === "open" ? t("pcr.state.open") : state === "ready" ? t("pcr.state.not_started") : t("pcr.state.locked")}
                />
                <span className="flex gap-2">
                  {state === "locked" ? <Lock className="size-4 text-muted-foreground" aria-label={t("pcr.state.locked")} /> : null}
                  {canWork && state === "ready" ? (
                    <Button type="button" size="sm" className="h-9" onClick={() => open(def)} disabled={busy === def.key}>
                      <CircleDot /> {t("pcr.open_step")}
                    </Button>
                  ) : null}
                  {row ? (
                    <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setEditing({ def, row })}>
                      <Pencil /> {row.status === "open" && canWork ? t("pcr.continue") : t("common.view")}
                    </Button>
                  ) : null}
                  {canWork && row?.status === "closed" && !nextStarted ? (
                    <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => reopen(row)} disabled={busy === def.key}>
                      <RotateCcw /> {t("pcr.reopen")}
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
      <StepDialog key={editing?.row.id ?? "none"} editing={editing} canWork={canWork} revalidate={revalidate} onClose={() => setEditing(null)} />
    </Card>
  );
}

function StepDialog({ editing, canWork, revalidate, onClose }: { editing: { def: PcrStep; row: PcrStepRow } | null; canWork: boolean; revalidate: string[]; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, unknown>>(editing?.row.details ?? {});
  const [missing, setMissing] = React.useState<string[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  if (!editing) return null;
  const { def, row } = editing;
  const readOnly = !canWork || row.status === "closed";
  const set = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));
  const fields = def.fields.filter((f) => pcrApplies(f.when, values) && (!f.when || pcrAppliesChain(def, f, values)));
  const docs = def.docs.filter((d) => pcrApplies(d.when, values));

  async function save(close: boolean) {
    setBusy(true);
    const res = await callRpc<{ missing: string[] }>("incident_step_save", { p_id: row.id, p_details: values }, revalidate);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    if (close) {
      const c = await callRpc<string>("incident_step_close", { p_id: row.id }, revalidate);
      setBusy(false);
      if (!c.ok) {
        setMissing(res.data.missing ?? []);
        toast.error(c.error);
        router.refresh();
        return;
      }
      toast.success(t("pcr.closed"));
      onClose();
      router.refresh();
      return;
    }
    setBusy(false);
    setMissing(res.data.missing ?? []);
    toast.success(t("common.saved"));
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[94svh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4 pr-12 md:px-6">
          <DialogTitle>
            {def.numeral}. {t(def.title)}
          </DialogTitle>
          <DialogDescription>{readOnly && row.status === "closed" ? t("pcr.closed_read_only") : t(def.hint)}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <React.Fragment key={f.key}>
                {f.group ? <h3 className="pt-2 text-sm font-semibold sm:col-span-2">{t(f.group)}</h3> : null}
                <FieldInput f={f} value={values[f.key]} onChange={(v) => set(f.key, v)} disabled={readOnly} />
              </React.Fragment>
            ))}
          </div>
          {docs.length ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("common.documents")}</h3>
              <p className="text-xs text-muted-foreground">{t("pcr.docs_hint", { labels: docs.map((d) => tl(d.label)).join(", ") })}</p>
              <AttachmentsBox table="incident_response_steps" rowId={row.id} resource="expenses.safety.incidents" bucket="incident-files" labels={docs.map((d) => tl(d.label))} multiple={docs.length > 1} readOnly={readOnly} />
            </div>
          ) : null}
          {missing && missing.length && !readOnly ? (
            <div className="rounded-lg bg-warning-bg p-3 text-sm text-warning">
              <p className="font-medium">{t("pcr.still_needed")}</p>
              <ul className="mt-1 list-disc pl-5">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {missing && missing.length === 0 && !readOnly ? (
            <p className="flex items-center gap-2 rounded-lg bg-success-bg p-3 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" /> {t("pcr.ready_to_close")}
            </p>
          ) : null}
        </div>
        <DialogFooter className="border-t p-4 md:px-6">
          <Button type="button" variant="outline" onClick={onClose}>
            {readOnly ? t("common.close") : t("common.cancel")}
          </Button>
          {!readOnly ? (
            <>
              <Button type="button" variant="outline" onClick={() => save(false)} disabled={busy}>
                {t("common.save")}
              </Button>
              <Button type="button" onClick={() => save(true)} disabled={busy}>
                <CheckCircle2 /> {t("pcr.save_close")}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A field shown under a select (Other) also needs that select's own condition. */
function pcrAppliesChain(def: PcrStep, f: PcrField, values: Record<string, unknown>) {
  const parent = def.fields.find((x) => x.key === f.when?.key);
  return !parent?.when || pcrApplies(parent.when, values);
}

function FieldInput({ f, value, onChange, disabled }: { f: PcrField; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const id = `pcr-${f.key}`;
  if (f.type === "checkbox") {
    return (
      <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm sm:col-span-2 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5">
        <Checkbox id={id} checked={value === true} onCheckedChange={(c) => onChange(c === true)} disabled={disabled} />
        <span>{t(f.label)}</span>
      </label>
    );
  }
  const label = (
    <label htmlFor={id} className="mb-1 block text-sm font-medium">
      {t(f.label)}
    </label>
  );
  const str = value === null || value === undefined ? "" : String(value);
  return (
    <div className={cn(f.wide || f.type === "textarea" ? "sm:col-span-2" : "")}>
      {label}
      {f.type === "textarea" ? (
        <Textarea id={id} rows={3} value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      ) : f.type === "select" ? (
        <Select value={str} onValueChange={(v) => onChange(v ?? "")} disabled={disabled}>
          <SelectTrigger id={id} className="h-10 w-full">
            <SelectValue placeholder={t("common.select_placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {(f.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          className="h-10"
          type={f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : f.type}
          inputMode={f.type === "number" ? "decimal" : undefined}
          min={f.type === "number" ? 0 : undefined}
          value={str}
          onChange={(e) => onChange(f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}
