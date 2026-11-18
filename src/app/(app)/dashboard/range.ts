// Shared by the server page and the client filters (no "use client" here).
export type RangeKey = "month" | "30d" | "quarter" | "year" | "custom";

// Calendar days in East Africa Time.
const todayEAT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function rangeFor(key: RangeKey, from?: string | null, to?: string | null): { from: string; to: string } {
  const end = todayEAT();
  const [y, m, d] = end.split("-").map(Number) as [number, number, number];
  switch (key) {
    case "month":
      return { from: iso(y, m - 1, 1), to: end };
    case "quarter":
      return { from: iso(y, Math.floor((m - 1) / 3) * 3, 1), to: end };
    case "year":
      return { from: iso(y, 0, 1), to: end };
    case "custom":
      return { from: from ?? iso(y, m - 1, d - 30), to: to ?? end };
    default:
      return { from: iso(y, m - 1, d - 30), to: end };
  }
}
