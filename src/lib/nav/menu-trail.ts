import type { Resource } from "@/lib/permissions";

/**
 * Where a page sits in the menu, from the menu itself (parent groups), not from its web address.
 * Addresses kept from the first version (for example /expenses/timesheet under Fleet administration)
 * no longer match the menu, so links back must follow the menu.
 */

/** Menu items the sidebar adds that are not resources of their own. */
export const MENU_EXTRAS: Resource[] = [
  { key: "inspections.mobilization", parent_key: "fleet_safety", name: "Mobilization inspection", label_prefix: null, path: "/inspections/mobilization", icon: "clipboard-check", sort_order: 303, has_reminders: false, is_request: false },
  { key: "daily_use.fuel_issues", parent_key: "daily_use", name: "Fuel log", label_prefix: null, path: "/daily-use/fuel-log", icon: "fuel", sort_order: 404, has_reminders: false, is_request: false },
];

/** Removed from the system: never shown or linked, even where the database still lists them. */
export const REMOVED_KEYS = new Set(["expenses.maintenance.requests", "expenses.leave.balances"]);

const base = (p: string | null) => (p ? p.split("?")[0]!.replace(/\/$/, "") : "");

function all(resources: Resource[]) {
  const keys = new Set(resources.map((r) => r.key));
  return [...resources, ...MENU_EXTRAS.filter((x) => !keys.has(x.key))].filter((r) => !REMOVED_KEYS.has(r.key));
}

/** The menu item a page belongs to: the one whose address is the longest start of the page address. */
export function menuItemFor(resources: Resource[], pathname: string): Resource | null {
  const p = base(pathname);
  let best: Resource | null = null;
  for (const r of all(resources)) {
    const b = base(r.path);
    if (!b || b === "/") continue;
    if ((p === b || p.startsWith(b + "/")) && (!best || b.length > base(best.path).length)) best = r;
  }
  return best;
}

/** The item and its groups, top group first. */
export function menuTrail(resources: Resource[], item: Resource): Resource[] {
  const byKey = new Map(all(resources).map((r) => [r.key, r]));
  const out: Resource[] = [item];
  let cur = item.parent_key ? byKey.get(item.parent_key) : undefined;
  while (cur && out.length < 8) {
    out.unshift(cur);
    cur = cur.parent_key ? byKey.get(cur.parent_key) : undefined;
  }
  return out;
}

/** The first page under a group, in menu order, that passes `allowed`. */
export function firstPageUnder(resources: Resource[], key: string, allowed: (r: Resource) => boolean): string | null {
  const list = all(resources);
  const children = (k: string) => list.filter((r) => r.parent_key === k).sort((a, b) => a.sort_order - b.sort_order);
  const walk = (k: string, depth: number): string | null => {
    if (depth > 6) return null;
    for (const c of children(k)) {
      if (c.path && allowed(c)) return c.path;
      const deeper = walk(c.key, depth + 1);
      if (deeper) return deeper;
    }
    return null;
  };
  return walk(key, 0);
}
