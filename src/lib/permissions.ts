/**
 * Permission engine (client and server). Mirrors public.permission_scope_for in the database:
 * for each role pick the grant whose resource key equals the resource or is its closest parent
 * (longest prefix wins), keep it only if the action is granted, then take the widest scope across roles.
 */
export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export"] as const;
export type PermissionAction = (typeof ACTIONS)[number];

export const SCOPES = ["own", "department", "all"] as const;
export type GrantScope = (typeof SCOPES)[number];

export type Grant = {
  role_id: string;
  resource_key: string;
  actions: PermissionAction[];
  scope: GrantScope;
};

export type Resource = {
  key: string;
  parent_key: string | null;
  name: string;
  label_prefix: string | null;
  path: string | null;
  icon: string | null;
  sort_order: number;
  has_reminders: boolean;
  is_request: boolean;
};

export type ResourceNode = Resource & { children: ResourceNode[] };

export type PermissionContextValue = {
  isOwner: boolean;
  isAdmin: boolean;
  grants: Grant[];
  resources: Resource[];
  /** Resource keys in the company's package. Mirrors public.package_allows. */
  packageKeys?: string[];
  /** Company is active or on trial and the subscription has not ended. Mirrors public.company_access_ok. */
  companyActive?: boolean;
};

const SCOPE_RANK: Record<GrantScope, number> = { own: 1, department: 2, all: 3 };

export function widerScope(a: GrantScope | null, b: GrantScope | null): GrantScope | null {
  if (!a) return b;
  if (!b) return a;
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

function matches(grantKey: string, resource: string) {
  return grantKey === resource || resource.startsWith(grantKey + ".");
}

/** Dashboard and Settings are always in a package; Platform never is; a key allows itself, its children and its ancestors. */
export function packageAllows(packageKeys: string[] | undefined, resource: string): boolean {
  const top = resource.split(".")[0];
  if (top === "dashboard" || top === "settings") return true;
  if (top === "platform") return false;
  return (packageKeys ?? []).some((k) => k === resource || resource.startsWith(k + ".") || k.startsWith(resource + "."));
}

export function permissionScope(ctx: PermissionContextValue, resource: string, action: PermissionAction): GrantScope | null {
  if (ctx.isOwner) return "all";
  if (ctx.companyActive === false) return null;
  if (!packageAllows(ctx.packageKeys, resource)) return null;
  // Best (longest) grant per role
  const bestByRole = new Map<string, Grant>();
  for (const g of ctx.grants) {
    if (!matches(g.resource_key, resource)) continue;
    const current = bestByRole.get(g.role_id);
    if (!current || g.resource_key.length > current.resource_key.length) {
      bestByRole.set(g.role_id, g);
    }
  }
  let scope: GrantScope | null = null;
  for (const g of bestByRole.values()) {
    if (g.actions.includes(action)) scope = widerScope(scope, g.scope);
  }
  return scope;
}

export function can(ctx: PermissionContextValue, resource: string, action: PermissionAction): boolean {
  return permissionScope(ctx, resource, action) !== null;
}

/** True if the user may view the resource itself or any of its descendants (used for sidebar groups). */
export function canViewAny(ctx: PermissionContextValue, resource: string): boolean {
  if (can(ctx, resource, "view")) return true;
  return ctx.resources.some((r) => r.key.startsWith(resource + ".") && can(ctx, r.key, "view"));
}

export function buildResourceTree(resources: Resource[]): ResourceNode[] {
  const byKey = new Map<string, ResourceNode>();
  const sorted = [...resources].sort((a, b) => a.sort_order - b.sort_order);
  for (const r of sorted) byKey.set(r.key, { ...r, children: [] });
  const roots: ResourceNode[] = [];
  for (const node of byKey.values()) {
    if (node.parent_key && byKey.has(node.parent_key)) {
      byKey.get(node.parent_key)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Keep only the parts of the tree the user may view. */
export function filterTree(ctx: PermissionContextValue, nodes: ResourceNode[]): ResourceNode[] {
  const out: ResourceNode[] = [];
  for (const n of nodes) {
    const children = filterTree(ctx, n.children);
    if (can(ctx, n.key, "view") || children.length > 0) {
      out.push({ ...n, children });
    }
  }
  return out;
}

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "view",
  create: "add",
  edit: "edit",
  delete: "delete",
  approve: "approve",
  export: "export",
};

export const SCOPE_LABELS: Record<GrantScope, string> = {
  all: "all records",
  department: "their department",
  own: "their own records",
};

/** "Fleet coordinator can view and add Fuel log entries for all vehicles" */
export function describeGrant(roleName: string, resourceName: string, actions: PermissionAction[], scope: GrantScope) {
  if (actions.length === 0) return `${roleName} has no access to ${resourceName}`;
  const verbs = actions.map((a) => ACTION_LABELS[a]);
  const list = verbs.length > 1 ? verbs.slice(0, -1).join(", ") + " and " + verbs[verbs.length - 1] : verbs[0];
  return `${roleName} can ${list} ${resourceName} for ${SCOPE_LABELS[scope]}`;
}
