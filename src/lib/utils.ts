export { cn } from "cn";

export function formatNumber(value: number | string | null | undefined, digits = 0) {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "";
  return new Intl.NumberFormat("en-TZ", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function formatTzs(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "";
  return `TZS ${new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(n)}`;
}

/** Every date and time in the app is East Africa Time, wherever the server or the browser runs. */
export const APP_TIME_ZONE = "Africa/Dar_es_Salaam";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(value: string | Date | null | undefined, withTime = false) {
  if (!value) return "";
  // A plain date (2026-11-19) is a calendar day: show it as it is, never shifted by a time zone.
  const d = typeof value === "string" ? new Date(DATE_ONLY.test(value) ? `${value}T12:00:00Z` : value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(d);
}

/** Days from today (East Africa Time) to the date; negative when it has passed. */
export function daysUntil(value: string | Date | null | undefined) {
  if (!value) return null;
  const target = typeof value === "string" && DATE_ONLY.test(value) ? value : toISODate(typeof value === "string" ? new Date(value) : value);
  const ms = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((ms(target) - ms(todayISO())) / 86400000);
}

/** The calendar day of a moment in East Africa Time, as YYYY-MM-DD. */
export function toISODate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function titleCase(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanize(s: string | null | undefined) {
  if (!s) return "";
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Today's date as YYYY-MM-DD (kept out of component bodies for the React Compiler). */
export function todayISO() {
  return toISODate(new Date());
}

export function daysFromNowISO(days: number) {
  return toISODate(new Date(Date.now() + days * 86400000));
}

export function nowMs() {
  return Date.now();
}
