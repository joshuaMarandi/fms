import type { Option } from "@/lib/forms/schema";

/**
 * Driver training matrix (company HSE document "Motor Vehicle Crash Categories", Training Matrix).
 * Each driver has one or more driver categories; each training is required, if applicable, optional,
 * basic or not applicable for a category, and is valid for a number of months (null: once).
 * Mirrors public.training_validity_months for the refresher date.
 */
export const DRIVER_CATEGORIES = ["light_vehicle", "four_wd", "bus", "hgv", "tanker"] as const;
export type DriverCategory = (typeof DRIVER_CATEGORIES)[number];
export const DRIVER_CATEGORY_OPTIONS: Option[] = DRIVER_CATEGORIES.map((k) => ({ value: k, label: `driver_category.${k}` }));

export const TRAINING_COURSES = [
  "hse_induction",
  "defensive_driving",
  "journey_fatigue",
  "pretrip_ivms",
  "off_road",
  "passenger_rollover",
  "load_securement",
  "dangerous_goods",
  "loading_fire",
  "first_aid",
] as const;
export type TrainingCourse = (typeof TRAINING_COURSES)[number];

/** M mandatory, A if applicable, O optional, B basic (basic fire), N not applicable. */
export type Need = "M" | "A" | "O" | "B" | "N";

/** Months a training stays valid (the shorter end of the document's range); null: done once. */
export const VALIDITY_MONTHS: Record<TrainingCourse, number | null> = {
  hse_induction: null,
  defensive_driving: 12,
  journey_fatigue: 12,
  pretrip_ivms: 12,
  off_road: 12,
  passenger_rollover: 24,
  load_securement: 12,
  dangerous_goods: 24,
  loading_fire: 12,
  first_aid: 24,
};

//                                   LV   4WD  Bus  HGV  Tanker
const ROWS: Record<TrainingCourse, [Need, Need, Need, Need, Need]> = {
  hse_induction: ["M", "M", "M", "M", "M"],
  defensive_driving: ["M", "M", "M", "M", "M"],
  journey_fatigue: ["M", "M", "M", "M", "M"],
  pretrip_ivms: ["M", "M", "M", "M", "M"],
  off_road: ["A", "M", "A", "A", "A"],
  passenger_rollover: ["O", "M", "M", "O", "O"],
  load_securement: ["O", "O", "O", "M", "M"],
  dangerous_goods: ["N", "N", "N", "A", "M"],
  loading_fire: ["B", "B", "B", "B", "M"],
  first_aid: ["O", "O", "O", "O", "O"],
};

const RANK: Record<Need, number> = { M: 5, B: 4, A: 3, O: 2, N: 1 };

/** What a driver needs of a training, from all their categories (the strongest need wins). */
export function needFor(course: TrainingCourse, categories: readonly string[]): Need | null {
  const idx = categories.map((c) => DRIVER_CATEGORIES.indexOf(c as DriverCategory)).filter((i) => i >= 0);
  if (idx.length === 0) return null;
  return idx.map((i) => ROWS[course][i]!).sort((a, b) => RANK[b] - RANK[a])[0]!;
}

/** Required: mandatory, or the basic level. */
export const isRequired = (n: Need | null) => n === "M" || n === "B";

export const COURSE_OPTIONS: Option[] = TRAINING_COURSES.map((k) => ({ value: k, label: `expenses.trainings.course.${k}` }));
export const courseCertificate = (k: string) => `expenses.trainings.doc.cert.${k}`;

/** The date a training done on `date` runs out (null when it is done once). */
export function expiryOf(course: TrainingCourse, date: string | null | undefined): string | null {
  const months = VALIDITY_MONTHS[course];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  if (!months || !m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, Number(m[3]))).toISOString().slice(0, 10);
}
