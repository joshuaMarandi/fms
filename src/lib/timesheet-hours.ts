/**
 * Timesheet shifts and how worked hours split into day time and night time.
 *
 * Shifts: day 06:00–14:00, noon 14:00–22:00, night 22:00–06:00, each with a one-hour rest (7 hours worked).
 * Night time is 20:00–06:00 (the night-work hours of the Employment and Labour Relations Act), so a noon
 * shift is partly day time (14:00–20:00) and partly night time (20:00–22:00).
 */

export const SHIFTS = ["day", "noon", "night"] as const;
export type Shift = (typeof SHIFTS)[number];

/** Standard times of each shift (rest in the middle). */
export const SHIFT_TIMES: Record<Shift, { time_in: string; break_from: string; break_to: string; time_out: string }> = {
  day: { time_in: "06:00", break_from: "10:00", break_to: "11:00", time_out: "14:00" },
  noon: { time_in: "14:00", break_from: "18:00", break_to: "19:00", time_out: "22:00" },
  night: { time_in: "22:00", break_from: "02:00", break_to: "03:00", time_out: "06:00" },
};

/** Night time starts and ends at these minutes of the day. */
export const NIGHT_FROM = 20 * 60;
export const NIGHT_TO = 6 * 60;

const DAY = 1440;

function minutes(v: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The shift a start time belongs to: 06:00–13:59 day, 14:00–21:59 noon, otherwise night. */
export function shiftOf(timeIn: unknown): Shift | null {
  const m = minutes(timeIn);
  if (m === null) return null;
  if (m >= 6 * 60 && m < 14 * 60) return "day";
  if (m >= 14 * 60 && m < 22 * 60) return "noon";
  return "night";
}

/** Minutes of [a, b) (b may pass midnight, up to two days) that fall in night time. */
function nightMinutes(a: number, b: number): number {
  let total = 0;
  // Night windows across the two days the span can touch: 00:00–06:00, 20:00–30:00, 44:00–48:00.
  for (const [s, e] of [
    [0, NIGHT_TO],
    [NIGHT_FROM, DAY + NIGHT_TO],
    [DAY + NIGHT_FROM, 2 * DAY],
  ] as const) {
    total += Math.max(0, Math.min(b, e) - Math.max(a, s));
  }
  return total;
}

/** Day-time and night-time hours worked on one row: time in to time out, less the rest. */
export function splitHours(row: { time_in?: unknown; time_out?: unknown; break_from?: unknown; break_to?: unknown }): { day: number; night: number; total: number } {
  const inn = minutes(row.time_in);
  let out = minutes(row.time_out);
  if (inn === null || out === null) return { day: 0, night: 0, total: 0 };
  if (out <= inn) out += DAY;
  let night = nightMinutes(inn, out);
  let total = out - inn;

  const bf = minutes(row.break_from);
  let bt = minutes(row.break_to);
  if (bf !== null && bt !== null) {
    // The rest sits inside the shift: move it to the same day as the span.
    let from = bf < inn ? bf + DAY : bf;
    if (bt <= bf) bt += DAY;
    let to = bt + (from - bf);
    from = Math.max(from, inn);
    to = Math.min(to, out);
    if (to > from) {
      total -= to - from;
      night -= nightMinutes(from, to);
    }
  }
  const h = (m: number) => Math.round((Math.max(0, m) / 60) * 100) / 100;
  return { day: h(total - night), night: h(night), total: h(total) };
}
