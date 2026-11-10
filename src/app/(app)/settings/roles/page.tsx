import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RolesClient, type RoleRow } from "./roles-client";
import type { Grant, Resource } from "@/lib/permissions";
import { t } from "@/i18n";

export default async function RolesPage({ searchParams }: PageProps<"/settings/roles">) {
  const sp = await searchParams;
  const session = await requirePermission("settings.roles", "view");
  const supabase = await createClient();

  const [{ data: roles }, { data: grants }, { data: resources }, { data: userRoles }, { data: ceilings }] = await Promise.all([
    supabase.from("roles").select("id, name, description, is_system, is_owner, is_admin, company_id").order("is_system", { ascending: false }).order("name"),
    supabase.from("role_grants").select("role_id, resource_key, actions, scope"),
    supabase.from("resources").select("*").order("sort_order"),
    supabase.from("user_roles").select("role_id"),
    supabase.from("admin_ceilings").select("resource_key").eq("user_id", session.userId),
  ]);

  const counts = new Map<string, number>();
  for (const ur of (userRoles ?? []) as { role_id: string }[]) counts.set(ur.role_id, (counts.get(ur.role_id) ?? 0) + 1);

  const rows: RoleRow[] = ((roles ?? []) as Omit<RoleRow, "user_count">[]).map((r) => ({ ...r, user_count: counts.get(r.id) ?? 0 }));

  return (
    <>
      <PageHeader title={t("settings.roles.title")} description={t("settings.roles.description")} />
      <RolesClient
        roles={rows}
        grants={(grants ?? []) as Grant[]}
        resources={(resources ?? []) as Resource[]}
        isOwner={session.permissions.isOwner}
        canEdit={session.can("settings.roles", "edit")}
        canCreate={session.can("settings.roles", "create")}
        ceiling={((ceilings ?? []) as { resource_key: string }[]).map((c) => c.resource_key)}
        myGrants={session.permissions.grants}
        openAdd={sp.add === "1"}
      />
    </>
  );
}
