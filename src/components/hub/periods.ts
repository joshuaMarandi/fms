/** Quick periods for the records pages. Dates are YYYY-MM-DD; `to` is inclusive; weeks start on Monday. */
export const PERIODS = ["today", "yesterday", "last_3_days", "this_week", "last_week", "this_month", "last_month", "last_30_days", "this_quarter", "past_6_months", "this_year", "past_year"] as const;
export type PeriodKey = (typeof PERIODS)[number];

export function isPeriod(v: unknown): v is PeriodKey {
  return typeof v === "string" && (PERIODS as readonly string[]).includes(v);
}

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** From and to for a quick period, counted from `today` (YYYY-MM-DD). */
export function periodRange(p: PeriodKey, today: string): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const now = new Date(Date.UTC(y, m - 1, d));
  const monday = addDays(now, -((now.getUTCDay() + 6) % 7));
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: iso(addDays(now, -1)), to: iso(addDays(now, -1)) };
    case "last_3_days":
      return { from: iso(addDays(now, -2)), to: today };
    case "this_week":
      return { from: iso(monday), to: today };
    case "last_week":
      return { from: iso(addDays(monday, -7)), to: iso(addDays(monday, -1)) };
    case "this_month":
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: today };
    case "last_month":
      return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) };
    case "last_30_days":
      return { from: iso(addDays(now, -29)), to: today };
    case "this_quarter":
      return { from: iso(new Date(Date.UTC(y, Math.floor((m - 1) / 3) * 3, 1))), to: today };
    case "past_6_months":
      return { from: iso(new Date(Date.UTC(y, m - 7, d + 1))), to: today };
    case "this_year":
      return { from: `${y}-01-01`, to: today };
    case "past_year":
      return { from: iso(new Date(Date.UTC(y - 1, m - 1, d + 1))), to: today };
  }
}

/** From and to for a month (YYYY-MM). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { from: `${month}-01`, to: iso(new Date(Date.UTC(y, m, 0))) };
}

/** From and to for a calendar year. */
export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
