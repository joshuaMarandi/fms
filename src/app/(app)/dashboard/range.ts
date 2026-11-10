// Shared by the server page and the client filters (no "use client" here).
export type RangeKey = "month" | "30d" | "quarter" | "year" | "custom";

export function rangeFor(key: RangeKey, from?: string | null, to?: string | null): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = iso(today);
  switch (key) {
    case "month":
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: end };
    case "quarter": {
      const q = Math.floor(today.getMonth() / 3) * 3;
      return { from: iso(new Date(today.getFullYear(), q, 1)), to: end };
    }
    case "year":
      return { from: iso(new Date(today.getFullYear(), 0, 1)), to: end };
    case "custom":
      return { from: from ?? iso(new Date(today.getTime() - 30 * 86400000)), to: to ?? end };
    default:
      return { from: iso(new Date(today.getTime() - 30 * 86400000)), to: end };
  }
}
