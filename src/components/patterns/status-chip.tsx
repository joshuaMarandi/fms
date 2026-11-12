import type * as React from "react";
import { cn, daysUntil, formatDate, formatNumber } from "@/lib/utils";
import { t, hasKey } from "@/i18n";

export type ChipTone = "success" | "warning" | "danger" | "neutral" | "info";

const TONE_BY_STATUS: Record<string, ChipTone> = {
  draft: "neutral",
  not_started: "neutral",
  pending: "neutral",
  submitted: "warning",
  awaiting: "warning",
  due_soon: "warning",
  under_review: "warning",
  in_progress: "warning",
  in_garage: "warning",
  notified: "warning",
  approved: "success",
  completed: "success",
  closed: "success",
  valid: "success",
  in_service: "success",
  active: "success",
  done: "success",
  uploaded: "success",
  signed: "success",
  safe: "success",
  rejected: "danger",
  open: "danger",
  overdue: "danger",
  expired: "danger",
  missing: "danger",
  out_of_service: "danger",
  inactive: "danger",
  not_safe: "danger",
};

/** Status is always colour plus a word. */
export function StatusChip({ status, tone, label, className }: { status: string; tone?: ChipTone; label?: string; className?: string }) {
  const resolvedTone = tone ?? TONE_BY_STATUS[status] ?? "neutral";
  const text = label ?? (hasKey(`status.${status}`) ? t(`status.${status}`) : status.replace(/_/g, " "));
  return (
    <span className={cn("status-chip", `status-chip-${resolvedTone}`, className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {text}
    </span>
  );
}

/** Green Valid, amber under 30 days with days left, red Overdue. With showDate: the date and the days left always. */
export function ReminderChip({ date, leadDays = 30, className, showDate }: { date: string | Date | null | undefined; leadDays?: number; className?: string; showDate?: boolean }) {
  if (!date) {
    return <StatusChip status="no_date" tone="neutral" label={t("reminder.no_date")} className={className} />;
  }
  const days = daysUntil(date)!;
  let chip: React.ReactNode;
  if (days < 0) chip = <StatusChip status="overdue" tone="danger" label={t("reminder.overdue_days", { days: Math.abs(days) })} className={className} />;
  else if (days === 0) chip = <StatusChip status="due_soon" tone="warning" label={t("reminder.due_today")} className={className} />;
  else if (days <= leadDays) chip = <StatusChip status="due_soon" tone="warning" label={t("reminder.days_left", { days })} className={className} />;
  else chip = <StatusChip status="valid" tone="success" label={showDate ? t("reminder.days_left", { days }) : t("reminder.valid")} className={className} />;
  if (!showDate) return chip;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap">
      <span className="tabular-nums">{formatDate(date)}</span>
      {chip}
    </span>
  );
}

/** Km-based reminder: next service vs current odometer. With showKm: the service km and the km left always. */
export function KmReminderChip({ dueKm, currentKm, leadKm = 500, className, showKm }: { dueKm: number | null | undefined; currentKm: number | null | undefined; leadKm?: number; className?: string; showKm?: boolean }) {
  if (dueKm === null || dueKm === undefined) return <StatusChip status="no_date" tone="neutral" label={t("reminder.no_date")} className={className} />;
  const remaining = dueKm - (currentKm ?? 0);
  let chip: React.ReactNode;
  if (remaining < 0) chip = <StatusChip status="overdue" tone="danger" label={`${t("status.overdue")} ${formatNumber(Math.abs(remaining))} km`} className={className} />;
  else if (remaining <= leadKm) chip = <StatusChip status="due_soon" tone="warning" label={`${formatNumber(remaining)} km`} className={className} />;
  else chip = <StatusChip status="valid" tone="success" label={showKm ? t("reminder.km_left", { km: formatNumber(remaining) }) : t("reminder.valid")} className={className} />;
  if (!showKm) return chip;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap">
      <span className="tabular-nums">{formatNumber(dueKm)} km</span>
      {chip}
    </span>
  );
}
