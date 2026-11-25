"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/patterns/date-picker";
import { saveRecord } from "@/lib/data/records";
import { formatDate, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

export type OpenAnomaly = { id: string; description?: string | null; action_required?: string | null; date_opened?: string | null };

/** The usual ways an anomaly is put right (ticked in the dialog; "Other" is typed). */
const SUGGESTED = ["repaired", "replaced", "adjusted", "topped_up", "cleaned", "garage", "no_fault"] as const;

/**
 * Close an open anomaly: say what was done by ticking the suggested actions (the required action
 * itself first) or typing another, and the day it was closed. Needs approve on Inspections.
 */
export function CloseAnomalyDialog({ anomaly, onOpenChange, onClosed, revalidate = [] }: { anomaly: OpenAnomaly | null; onOpenChange: (open: boolean) => void; onClosed?: () => void; revalidate?: string[] }) {
  const [picked, setPicked] = React.useState<string[]>([]);
  const [other, setOther] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // A fresh form for each anomaly opened.
  const id = anomaly?.id ?? null;
  const [shownFor, setShownFor] = React.useState<string | null>(null);
  if (id !== shownFor) {
    setShownFor(id);
    setPicked([]);
    setOther("");
    setDate(todayISO());
    setError(null);
  }

  const required = (anomaly?.action_required ?? "").trim();
  const options = [...(required ? [{ key: "as_required", label: t("inspections.close.as_required", { action: required }) }] : []), ...SUGGESTED.map((k) => ({ key: k, label: t(`inspections.close.${k}`) }))];

  async function submit() {
    if (!anomaly) return;
    const done = options.filter((o) => picked.includes(o.key)).map((o) => (o.key === "as_required" ? required : o.label));
    if (other.trim()) done.push(other.trim());
    if (done.length === 0) {
      setError(t("inspections.close.choose_one"));
      return;
    }
    if (anomaly.date_opened && date < anomaly.date_opened) {
      setError(t("inspections.close.before_opened", { date: formatDate(anomaly.date_opened) }));
      return;
    }
    setBusy(true);
    const res = await saveRecord({ table: "inspection_anomalies", id: anomaly.id, values: { status: "closed", date_closed: date, action_taken: done.join("; ") }, revalidate: ["/inspections/anomalies", "/fleet", ...revalidate] });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("inspections.anomaly.closed"));
    onOpenChange(false);
    onClosed?.();
  }

  return (
    <Dialog open={!!anomaly} onOpenChange={onOpenChange}>
      {/* Wide on a computer: the choices in two columns, Other and the date side by side. */}
      <DialogContent className="flex max-h-[94svh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b p-4 pr-12 md:px-6">
          <DialogTitle>{t("inspections.anomaly.close")}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{anomaly?.description ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          {required ? (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
              <span className="font-medium">{t("inspections.col.action_required")}:</span> {required}
            </p>
          ) : null}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t("inspections.close.what_done")}</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {options.map((o) => (
                <label
                  key={o.key}
                  className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-success has-data-[state=checked]:bg-success-bg ${o.key === "as_required" ? "md:col-span-2" : ""}`}
                >
                  <Checkbox checked={picked.includes(o.key)} onCheckedChange={(c) => setPicked((p) => (c ? [...p, o.key] : p.filter((x) => x !== o.key)))} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="space-y-1">
              <label htmlFor="close-other" className="text-sm font-medium">
                {t("inspections.close.other")}
              </label>
              <Textarea id="close-other" rows={3} value={other} onChange={(e) => setOther(e.target.value)} placeholder={t("inspections.close.other_placeholder")} />
            </div>
            <div className="space-y-1">
              <label htmlFor="close-date" className="text-sm font-medium">
                {t("inspections.anomaly.date_closed")}
              </label>
              <DatePicker id="close-date" value={date} onChange={(v) => setDate(v || todayISO())} />
            </div>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
        <DialogFooter className="border-t p-4 md:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? t("common.saving") : t("inspections.anomaly.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
