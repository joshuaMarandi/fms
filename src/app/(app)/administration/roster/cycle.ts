/** The rotating block roster: Day -> Noon -> Night -> OFF, each for a block of days (7 by default). */
export const PATTERN = ["day", "noon", "night", "off"] as const;
export type Shift = (typeof PATTERN)[number] | "leave" | "sick" | "standby";

export type RosterSettings = {
  id: string | null;
  cycle_start: string;
  block_days: number;
  day_from: string;
  day_to: string;
  noon_from: string;
  noon_to: string;
  night_from: string;
  night_to: string;
};

export type RosterMember = {
  id: string;
  team: string;
  driver_id: string | null;
  person_name: string;
  employment_id: string | null;
  role: "driver" | "coordinator";
  start_phase: number;
  sort_order: number;
};

export type RosterException = { id: string; member_id: string; roster_date: string; shift: Shift; notes: string | null };

const DAY = 86_400_000;
export const toDay = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fromDay(toDay(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toDay(b) - toDay(a)) / DAY);

/** The shift the cycle gives this person on this date. */
export function cycleShift(member: Pick<RosterMember, "start_phase">, date: string, s: Pick<RosterSettings, "cycle_start" | "block_days">): (typeof PATTERN)[number] {
  const block = Math.floor(daysBetween(s.cycle_start, date) / s.block_days);
  const i = (((member.start_phase + block) % 4) + 4) % 4;
  return PATTERN[i]!;
}

/** First day of the cycle that contains `date` (cycles are 4 blocks long). */
export function cycleStartFor(date: string, s: Pick<RosterSettings, "cycle_start" | "block_days">) {
  const len = s.block_days * 4;
  const k = Math.floor(daysBetween(s.cycle_start, date) / len);
  return addDays(s.cycle_start, k * len);
}
