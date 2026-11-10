"use client";

import * as React from "react";
import {
  can as canFn,
  permissionScope,
  type GrantScope,
  type PermissionAction,
  type PermissionContextValue,
  type Resource,
} from "@/lib/permissions";
import type { Locale } from "@/i18n";
import { setLocale } from "@/i18n";

export type SessionLite = {
  userId: string;
  email: string | null;
  fullName: string;
  avatarUrl: string | null;
  companyId: string | null;
  companyName: string | null;
  driverId: string | null;
  locale: Locale;
  roleNames: string[];
  primaryRole: string | null;
  isDriverOnly: boolean;
  isOwner: boolean;
  platformMode: boolean;
};

type Ctx = {
  session: SessionLite;
  permissions: PermissionContextValue;
  can: (resource: string, action: PermissionAction) => boolean;
  scope: (resource: string, action: PermissionAction) => GrantScope | null;
  resources: Resource[];
};

const PermissionContext = React.createContext<Ctx | null>(null);

export function PermissionProvider({
  session,
  permissions,
  children,
}: {
  session: SessionLite;
  permissions: PermissionContextValue;
  children: React.ReactNode;
}) {
  setLocale(session.locale);
  const value = React.useMemo<Ctx>(
    () => ({
      session,
      permissions,
      can: (resource, action) => canFn(permissions, resource, action),
      scope: (resource, action) => permissionScope(permissions, resource, action),
      resources: permissions.resources,
    }),
    [session, permissions],
  );
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const ctx = React.useContext(PermissionContext);
  if (!ctx) throw new Error("usePermissions must be used inside PermissionProvider");
  return ctx;
}

/** can(resourceKey, action) hook */
export function useCan() {
  return usePermissions().can;
}

export function useSession() {
  return usePermissions().session;
}

/** Renders children only when the user holds the permission. */
export function Can({
  resource,
  action = "view",
  fallback = null,
  children,
}: {
  resource: string;
  action?: PermissionAction;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const can = useCan();
  return <>{can(resource, action) ? children : fallback}</>;
}
