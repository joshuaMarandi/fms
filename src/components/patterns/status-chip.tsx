import { cn, daysUntil, formatNumber } from "@/lib/utils";
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

/** Green Valid, amber under 30 days with days left, red Overdue. */
export function ReminderChip({ date, leadDays = 30, className }: { date: string | Date | null | undefined; leadDays?: number; className?: string }) {
  if (!date) {
    return <StatusChip status="no_date" tone="neutral" label={t("reminder.no_date")} className={className} />;
  }
  const days = daysUntil(date)!;
  if (days < 0) {
    return <StatusChip status="overdue" tone="danger" label={t("reminder.overdue_days", { days: Math.abs(days) })} className={className} />;
  }
  if (days === 0) {
    return <StatusChip status="due_soon" tone="warning" label={t("reminder.due_today")} className={className} />;
  }
  if (days <= leadDays) {
    return <StatusChip status="due_soon" tone="warning" label={t("reminder.days_left", { days })} className={className} />;
  }
  return <StatusChip status="valid" tone="success" label={t("reminder.valid")} className={className} />;
}

/** Km-based reminder: next service vs current odometer. */
export function KmReminderChip({ dueKm, currentKm, leadKm = 500, className }: { dueKm: number | null | undefined; currentKm: number | null | undefined; leadKm?: number; className?: string }) {
  if (dueKm === null || dueKm === undefined) return <StatusChip status="no_date" tone="neutral" label={t("reminder.no_date")} className={className} />;
  const remaining = dueKm - (currentKm ?? 0);
  if (remaining < 0) return <StatusChip status="overdue" tone="danger" label={`${t("status.overdue")} ${formatNumber(Math.abs(remaining))} km`} className={className} />;
  if (remaining <= leadKm) return <StatusChip status="due_soon" tone="warning" label={`${formatNumber(remaining)} km`} className={className} />;
  return <StatusChip status="valid" tone="success" label={t("reminder.valid")} className={className} />;
}
