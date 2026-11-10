import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { UsersClient, type UserRow, type RoleOption } from "./users-client";
import { t } from "@/i18n";

export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const sp = await searchParams;
  const session = await requirePermission("settings.users", "view");
  const supabase = await createClient();

  const [{ data: profiles }, { data: userRoles }, { data: roles }, { data: ceilings }, { data: resources }, { data: drivers }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone, job_title, department, is_active, driver_id, company_id").order("full_name"),
    supabase.from("user_roles").select("user_id, role_id, is_primary"),
    supabase.from("roles").select("id, name, is_system, is_owner, is_admin, company_id").order("name"),
    supabase.from("admin_ceilings").select("user_id, resource_key"),
    supabase.from("resources").select("key, name, parent_key, sort_order").is("parent_key", null).order("sort_order"),
    supabase.from("drivers").select("id, full_name").is("deleted_at", null).order("full_name"),
  ]);

  const rolesById = new Map(((roles ?? []) as RoleOption[]).map((r) => [r.id, r]));
  const rows: UserRow[] = ((profiles ?? []) as Record<string, unknown>[]).map((p) => {
    const ur = ((userRoles ?? []) as { user_id: string; role_id: string; is_primary: boolean }[]).filter((x) => x.user_id === p.id);
    const primary = ur.find((x) => x.is_primary) ?? ur[0];
    return {
      id: p.id as string,
      full_name: p.full_name as string,
      email: (p.email as string) ?? null,
      phone: (p.phone as string) ?? null,
      job_title: (p.job_title as string) ?? null,
      department: (p.department as string) ?? null,
      is_active: p.is_active as boolean,
      driver_id: (p.driver_id as string) ?? null,
      primary_role_id: primary?.role_id ?? null,
      primary_role: primary ? rolesById.get(primary.role_id)?.name ?? "" : "",
      extra_role_ids: ur.filter((x) => x.role_id !== primary?.role_id).map((x) => x.role_id),
      is_admin: ur.some((x) => rolesById.get(x.role_id)?.is_admin),
      ceiling: ((ceilings ?? []) as { user_id: string; resource_key: string }[]).filter((c) => c.user_id === p.id).map((c) => c.resource_key),
    };
  });

  return (
    <>
      <PageHeader title={t("settings.users.title")} description={t("settings.users.description")} />
      <UsersClient
        rows={rows}
        roles={(roles ?? []) as RoleOption[]}
        modules={((resources ?? []) as { key: string; name: string }[]).filter((r) => r.key !== "settings")}
        drivers={(drivers ?? []) as { id: string; full_name: string }[]}
        canEdit={session.can("settings.users", "edit")}
        canInvite={session.can("settings.users", "create")}
        isOwner={session.permissions.isOwner}
        openInvite={sp.invite === "1"}
      />
    </>
  );
}
