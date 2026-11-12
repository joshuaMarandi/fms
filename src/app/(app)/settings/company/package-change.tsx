"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpCircle, Check, Clock, Truck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PublicPackage } from "@/components/landing/pricing";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { cancelPackageChange, requestPackageChange } from "./package-actions";
import { t } from "@/i18n";

export type PackageRequest = { id: string; status: "pending" | "approved" | "rejected" | "cancelled"; to_name: string; created_at: string; decided_at: string | null; decision_note: string | null };

/** Change package: the admin picks another package, the owner approves it and it applies at once. */
export function PackageChange({ packages, currentId, vehiclesUsed, latest, canEdit }: { packages: PublicPackage[]; currentId: string | null; vehiclesUsed: number; latest: PackageRequest | null; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const current = packages.find((p) => p.id === currentId);
  const pending = latest?.status === "pending" ? latest : null;
  const rejected = latest?.status === "rejected" ? latest : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!choice) return;
    setBusy(true);
    const res = await requestPackageChange(choice, note);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("subscription.change.sent"));
    setOpen(false);
    setNote("");
    router.refresh();
  }

  async function cancel() {
    if (!pending) return;
    setBusy(true);
    const res = await cancelPackageChange(pending.id);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d98b1f]/50 bg-warning-bg p-3 text-sm text-warning">
          <span className="flex items-center gap-2">
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            {t("subscription.change.pending", { package: pending.to_name, date: formatDate(pending.created_at) })}
          </span>
          {canEdit ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={cancel}>
              {t("subscription.change.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {rejected ? (
        <div className="flex items-start gap-2 rounded-lg bg-danger-bg p-3 text-sm text-danger">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t("subscription.change.rejected", { package: rejected.to_name, reason: rejected.decision_note ?? "" })}</span>
        </div>
      ) : null}

      {canEdit ? (
        <Button onClick={() => setOpen(true)} className="h-10">
          <ArrowUpCircle /> {pending ? t("subscription.change.again") : t("subscription.change.button")}
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("subscription.change.title")}</DialogTitle>
            <DialogDescription>{t("subscription.change.description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">{t("subscription.package")}</legend>
              {packages.map((p) => {
                const isCurrent = p.id === currentId;
                const tooSmall = vehiclesUsed > p.max_vehicles;
                const disabled = isCurrent || tooSmall;
                const up = current ? p.price > current.price : true;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "relative flex cursor-pointer flex-col rounded-xl border p-4 transition-colors",
                      choice === p.id ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/40 hover:bg-primary/5",
                      disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
                    )}
                  >
                    <input type="radio" name="package" value={p.id} className="sr-only" disabled={disabled} checked={choice === p.id} onChange={() => setChoice(p.id)} />
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-semibold">{p.name}</span>
                      {isCurrent ? (
                        <span className="status-chip status-chip-success">{t("subscription.change.current")}</span>
                      ) : tooSmall ? (
                        <span className="status-chip status-chip-danger">{t("subscription.change.too_small")}</span>
                      ) : (
                        <span className={cn("status-chip", up ? "status-chip-success" : "status-chip-warning")}>{up ? t("subscription.change.upgrade") : t("subscription.change.downgrade")}</span>
                      )}
                    </span>
                    <span className="mt-1 text-lg font-semibold tabular-nums">
                      <span className="text-xs font-medium text-muted-foreground">{p.currency}</span> {formatNumber(p.price)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{t(`platform.packages.period.${p.billing_period}`)}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                      <Truck className="size-3.5 text-primary" aria-hidden="true" /> {t("platform.packages.vehicles_up_to", { count: p.max_vehicles })}
                    </span>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {p.modules.map((m) => (
                        <li key={m} className="flex items-start gap-1.5">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" /> {m}
                        </li>
                      ))}
                    </ul>
                  </label>
                );
              })}
            </fieldset>
            <Field>
              <FieldLabel htmlFor="pc-note">{t("subscription.change.note")}</FieldLabel>
              <Textarea id="pc-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("subscription.change.note_placeholder")} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || !choice}>
                {t("subscription.change.send")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
