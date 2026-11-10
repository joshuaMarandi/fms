import en from "./en.json";
import sw from "./sw.json";

export type Locale = "en" | "sw";
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "sw", label: "Kiswahili" },
];

type Dict = Record<string, string>;
const dictionaries: Record<Locale, Dict> = { en: en as Dict, sw: sw as Dict };

let currentLocale: Locale = "en";
const missing = new Set<string>();

export function setLocale(locale: Locale) {
  currentLocale = dictionaries[locale] ? locale : "en";
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Translate a key. Falls back to English, then to a humanised version of the last key segment.
 * Placeholders use {name}.
 */
export function t(key: string, vars?: Record<string, string | number>, locale?: Locale): string {
  const loc = locale ?? currentLocale;
  let text = dictionaries[loc]?.[key] ?? dictionaries.en[key];
  if (text === undefined) {
    if (process.env.NODE_ENV !== "production" && !missing.has(key)) {
      missing.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    const last = key.split(".").pop() ?? key;
    text = last.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

export function hasKey(key: string) {
  return key in dictionaries.en;
}
