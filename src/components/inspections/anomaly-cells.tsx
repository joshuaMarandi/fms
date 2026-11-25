"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";
import type { OpenAnomaly } from "./close-anomaly-dialog";

export type AnomalyAction = OpenAnomaly & { status?: string | null; action_taken?: string | null; date_closed?: string | null; deleted_at?: string | null };

const live = (v: unknown) => (Array.isArray(v) ? (v as AnomalyAction[]) : []).filter((a) => !a.deleted_at);

/** Open actions, in red, each with Close (for whoever may close anomalies). */
export function ActionRequiredCell({ value, onClose }: { value: unknown; onClose?: (a: OpenAnomaly) => void }) {
  const open = live(value).filter((a) => a.status === "open");
  if (open.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="max-w-[320px] space-y-1.5">
      {open.map((a) => (
        <li key={a.id} className="flex items-start gap-2 rounded-md bg-danger-bg px-2 py-1.5 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 whitespace-normal">
            <span className="sr-only">{t("status.open")}: </span>
            {a.action_required || a.description}
          </span>
          {onClose ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 border-danger/40 bg-background px-2 text-xs text-danger hover:bg-background"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onClose(a);
              }}
            >
              {t("inspections.close.button")}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Closed actions, in green: what was done and when. */
export function ActionTakenCell({ value }: { value: unknown }) {
  const closed = live(value).filter((a) => a.status === "closed");
  if (closed.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="max-w-[320px] space-y-1.5">
      {closed.map((a) => (
        <li key={a.id} className="flex items-start gap-2 rounded-md bg-success-bg px-2 py-1.5 text-sm text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 whitespace-normal">
            <span className="sr-only">{t("status.closed")}: </span>
            {a.action_taken || a.action_required || a.description}
            {a.date_closed ? <span className="block text-xs opacity-80">{t("inspections.close.closed_on", { date: formatDate(a.date_closed) })}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Text for export: open actions, or closed ones with what was done. */
export function actionsText(value: unknown, which: "required" | "taken") {
  return live(value)
    .filter((a) => (which === "required" ? a.status === "open" : a.status === "closed"))
    .map((a) => (which === "required" ? a.action_required || a.description || "" : `${a.action_taken || a.action_required || ""}${a.date_closed ? ` (${formatDate(a.date_closed)})` : ""}`))
    .join("; ");
}
