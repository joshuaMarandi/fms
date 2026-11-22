import { isPeriod, monthRange, periodRange } from "@/components/hub/periods";
import { formatDate, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

type Params = Record<string, string | string[] | undefined> | undefined;
const one = (v: unknown) => (typeof v === "string" ? v : undefined);
const isDay = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * The dates chosen with UrlDateFilter: null for all time (the default), else from and to
 * (inclusive, YYYY-MM-DD, East Africa Time), with a short label for the summary cards.
 */
export function rangeFromParams(sp: Params, opts?: { defaultMonth?: boolean }): { from: string; to: string; label: string } | null {
  const period = one(sp?.period);
  // Pages that land on the current month (no dates in the address, and not "any date").
  if (opts?.defaultMonth && !isPeriod(period) && period !== "all" && !isDay(one(sp?.from)) && !isDay(one(sp?.to))) {
    const r = monthRange(todayISO().slice(0, 7));
    return { ...r, label: monthName(r.from) };
  }
  if (isPeriod(period)) {
    const r = periodRange(period, todayISO());
    return { ...r, label: t(`hub.period.${period}`) };
  }
  const from = one(sp?.from);
  const to = one(sp?.to);
  if (!isDay(from) && !isDay(to)) return null;
  const f = isDay(from) ? from! : "1900-01-01";
  const e = isDay(to) ? to! : "2999-12-31";
  const whole = isDay(from) && isDay(to) && /-01$/.test(f) && monthRange(f.slice(0, 7)).to === e;
  if (whole) return { from: f, to: e, label: monthName(f) };
  if (isDay(from) && isDay(to) && f === e) return { from: f, to: e, label: formatDate(f) };
  return { from: f, to: e, label: isDay(from) && isDay(to) ? `${formatDate(f)} – ${formatDate(e)}` : isDay(from) ? t("filter.since", { date: formatDate(f) }) : t("filter.until", { date: formatDate(e) }) };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

/** Whether a YYYY-MM-DD (or timestamp) falls in the range; true when the range is all time. */
export function inRange(range: { from: string; to: string } | null, value: string | null | undefined) {
  if (!range) return true;
  if (!value) return false;
  const d = value.slice(0, 10);
  return d >= range.from && d <= range.to;
}
