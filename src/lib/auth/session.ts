import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Grant, PermissionContextValue, Resource } from "@/lib/permissions";
import { can, permissionScope, type PermissionAction } from "@/lib/permissions";
import { logoUrlFor, type CompanyBrand } from "@/lib/branding";

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
  brand: CompanyBrand | null;
  subscription: Subscription | null;
  companies: { id: string; name: string }[];
  permissions: PermissionContextValue;
  can: (resource: string, action: PermissionAction) => boolean;
  scope: (resource: string, action: PermissionAction) => ReturnType<typeof permissionScope>;
  isDriverOnly: boolean;
  /** Owner working on the platform, outside any company. */
  platformMode: boolean;
};

/**
 * Loads the signed-in user, profile, roles, grants and the resource tree once per request.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  // getClaims verifies the JWT locally (signing keys are cached), so no round trip to the Auth server.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const { data: ctx } = await supabase.rpc("session_context");
  if (!ctx) return null;
  const c = ctx as {
    profile: Profile;
    roles: RoleSummary[];
    grants: Grant[];
    resources: Resource[];
    company: null | {
      id: string;
      name: string;
      logo_url: string | null;
      settings: Record<string, unknown>;
      status: Subscription["status"];
      subscription_start: string | null;
      subscription_end: string | null;
      package_id: string | null;
      active: boolean;
      package: null | { id: string; name: string; price: number; currency: string; billing_period: string; max_vehicles: number };
      logo_version: number | null;
      address: string | null;
      city: string | null;
      country: string | null;
      phone: string | null;
      email: string | null;
      tax_number: string | null;
      website: string | null;
    };
    package_keys: string[];
    companies: { id: string; name: string }[];
  };

  const roles = c.roles ?? [];
  const isOwner = roles.some((r) => r.is_owner);
  const isAdmin = roles.some((r) => r.is_admin);

  let company: SessionContext["company"] = null;
  let subscription: Subscription | null = null;
  let brand: CompanyBrand | null = null;
  if (c.company) {
    brand = {
      id: c.company.id,
      name: c.company.name,
      logoUrl: logoUrlFor(c.company.id, c.company.logo_version),
      address: c.company.address ?? null,
      city: c.company.city ?? null,
      country: c.company.country ?? null,
      phone: c.company.phone ?? null,
      email: c.company.email ?? null,
      taxNumber: c.company.tax_number ?? null,
      website: c.company.website ?? null,
    };
    company = { id: c.company.id, name: c.company.name, logo_url: c.company.logo_url, settings: c.company.settings ?? {} };
    const pkg = c.company.package;
    subscription = {
      status: c.company.status,
      start: c.company.subscription_start,
      end: c.company.subscription_end,
      active: c.company.active,
      packageId: c.company.package_id,
      packageName: pkg?.name ?? null,
      price: pkg ? Number(pkg.price) : null,
      currency: pkg?.currency ?? null,
      billingPeriod: pkg?.billing_period ?? null,
      maxVehicles: pkg?.max_vehicles ?? null,
      packageKeys: c.package_keys ?? [],
    };
  }

  const permissions: PermissionContextValue = {
    isOwner,
    isAdmin,
    grants: c.grants ?? [],
    resources: c.resources ?? [],
    packageKeys: subscription?.packageKeys ?? [],
    companyActive: subscription?.active ?? false,
  };
  const companies = isOwner ? c.companies ?? [] : [];
  const profile = c.profile;
  const user = { id: claims.sub as string, email: (claims.email as string | undefined) ?? profile.email ?? null };

  const driverOnly = roles.length > 0 && roles.every((r) => r.name === "Driver");

  return {
    userId: user.id,
    email: user.email,
    profile: profile as unknown as Profile,
    roles,
    company,
    brand,
    subscription,
    companies,
    permissions,
    can: (resource, action) => can(permissions, resource, action),
    scope: (resource, action) => permissionScope(permissions, resource, action),
    isDriverOnly: driverOnly,
    platformMode: isOwner && !company,
  };
});

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile.is_active) redirect("/login?inactive=1");
  return session;
}

/** Require a permission or redirect to the No access page. */
/** Pages the owner can use on the platform; everything else needs a company workspace. */
export function platformAllows(resource: string) {
  return resource.startsWith("platform") || resource === "settings" || resource === "settings.roles" || resource === "settings.audit";
}

export async function requirePermission(resource: string, action: PermissionAction = "view"): Promise<SessionContext> {
  const session = await requireSession();
  if (session.platformMode && !platformAllows(resource)) redirect("/platform");
  if (!session.can(resource, action)) {
    redirect(`/no-access?resource=${encodeURIComponent(resource)}&action=${action}`);
  }
  return session;
}
