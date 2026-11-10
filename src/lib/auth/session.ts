import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Grant, PermissionContextValue, Resource } from "@/lib/permissions";
import { can, permissionScope, type PermissionAction } from "@/lib/permissions";

export type Profile = {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  employment_number: string | null;
  employer: string | null;
  driver_id: string | null;
  avatar_url: string | null;
  locale: string;
  is_active: boolean;
  notification_prefs: { email?: boolean; in_app?: boolean };
};

export type Subscription = {
  status: "pending" | "trial" | "active" | "suspended" | "cancelled";
  start: string | null;
  end: string | null;
  active: boolean;
  packageId: string | null;
  packageName: string | null;
  price: number | null;
  currency: string | null;
  billingPeriod: string | null;
  maxVehicles: number | null;
  packageKeys: string[];
};

export type RoleSummary = { id: string; name: string; is_owner: boolean; is_admin: boolean; is_system: boolean; is_primary: boolean };

export type SessionContext = {
  userId: string;
  email: string | null;
  profile: Profile;
  roles: RoleSummary[];
  company: { id: string; name: string; logo_url: string | null; settings: Record<string, unknown> } | null;
  subscription: Subscription | null;
  companies: { id: string; name: string }[];
  permissions: PermissionContextValue;
  can: (resource: string, action: PermissionAction) => boolean;
  scope: (resource: string, action: PermissionAction) => ReturnType<typeof permissionScope>;
  isDriverOnly: boolean;
};

/**
 * Loads the signed-in user, profile, roles, grants and the resource tree once per request.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: userRoles }, { data: resources }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("is_primary, roles(id, name, is_owner, is_admin, is_system)").eq("user_id", user.id),
    supabase.from("resources").select("*").order("sort_order"),
  ]);

  if (!profile) return null;

  const roles: RoleSummary[] = (userRoles ?? [])
    .map((ur) => {
      const r = ur.roles as unknown as { id: string; name: string; is_owner: boolean; is_admin: boolean; is_system: boolean } | null;
      if (!r) return null;
      return { ...r, is_primary: ur.is_primary };
    })
    .filter((r): r is RoleSummary => r !== null)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

  const roleIds = roles.map((r) => r.id);
  const { data: grants } = roleIds.length
    ? await supabase.from("role_grants").select("role_id, resource_key, actions, scope").in("role_id", roleIds)
    : { data: [] as Grant[] };

  const isOwner = roles.some((r) => r.is_owner);
  const isAdmin = roles.some((r) => r.is_admin);

  const permissions: PermissionContextValue = {
    isOwner,
    isAdmin,
    grants: (grants ?? []) as Grant[],
    resources: (resources ?? []) as Resource[],
  };

  let company: SessionContext["company"] = null;
  let subscription: Subscription | null = null;
  let companies: SessionContext["companies"] = [];
  if (profile.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, logo_url, settings, status, subscription_start, subscription_end, package_id, package:packages(id, name, price, currency, billing_period, max_vehicles)")
      .eq("id", profile.company_id)
      .maybeSingle();
    if (data) {
      const c = data as Record<string, unknown>;
      company = { id: c.id as string, name: c.name as string, logo_url: (c.logo_url as string) ?? null, settings: (c.settings as Record<string, unknown>) ?? {} };
      const pkg = c.package as { id: string; name: string; price: number; currency: string; billing_period: string; max_vehicles: number } | null;
      const { data: keys } = c.package_id ? await supabase.from("package_resources").select("resource_key").eq("package_id", c.package_id as string) : { data: [] };
      const end = (c.subscription_end as string) ?? null;
      const status = c.status as Subscription["status"];
      subscription = {
        status,
        start: (c.subscription_start as string) ?? null,
        end,
        active: (status === "active" || status === "trial") && (!end || end >= new Date().toISOString().slice(0, 10)),
        packageId: (c.package_id as string) ?? null,
        packageName: pkg?.name ?? null,
        price: pkg?.price ?? null,
        currency: pkg?.currency ?? null,
        billingPeriod: pkg?.billing_period ?? null,
        maxVehicles: pkg?.max_vehicles ?? null,
        packageKeys: ((keys ?? []) as { resource_key: string }[]).map((k) => k.resource_key),
      };
    }
  }
  if (isOwner) {
    const { data } = await supabase.from("companies").select("id, name").is("deleted_at", null).order("name");
    companies = data ?? [];
  }
  permissions.packageKeys = subscription?.packageKeys ?? [];
  permissions.companyActive = subscription?.active ?? false;

  const driverOnly = roles.length > 0 && roles.every((r) => r.name === "Driver");

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile as unknown as Profile,
    roles,
    company,
    subscription,
    companies,
    permissions,
    can: (resource, action) => can(permissions, resource, action),
    scope: (resource, action) => permissionScope(permissions, resource, action),
    isDriverOnly: driverOnly,
  };
});

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile.is_active) redirect("/login?inactive=1");
  return session;
}

/** Require a permission or redirect to the No access page. */
export async function requirePermission(resource: string, action: PermissionAction = "view"): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.can(resource, action)) {
    redirect(`/no-access?resource=${encodeURIComponent(resource)}&action=${action}`);
  }
  return session;
}
