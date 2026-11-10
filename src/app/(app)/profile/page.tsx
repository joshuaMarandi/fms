import { PageHeader } from "@/components/shell/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { describeGrant, type PermissionAction, type GrantScope } from "@/lib/permissions";
import { ProfileForm, PasswordForm, NotificationPrefsForm } from "./forms";
import { t } from "@/i18n";
import Link from "next/link";

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "profile";
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: perms }, { data: driver }] = await Promise.all([
    supabase.rpc("my_permissions"),
    session.profile.driver_id ? supabase.from("drivers").select("id, full_name, employment_number").eq("id", session.profile.driver_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const rows = (perms ?? []) as { resource_key: string; resource_name: string; actions: PermissionAction[]; scope: GrantScope }[];
  const primaryRole = session.roles[0]?.name ?? "";

  return (
    <>
      <PageHeader title={t("profile.title")} description={t("profile.description")} />
      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">{t("nav.my_profile")}</TabsTrigger>
          <TabsTrigger value="password">{t("nav.change_password")}</TabsTrigger>
          <TabsTrigger value="notifications">{t("nav.notification_settings")}</TabsTrigger>
          <TabsTrigger value="permissions">{t("profile.permissions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="grid gap-6 lg:grid-cols-3">
          <div className="page-card p-6 lg:col-span-2">
            <ProfileForm profile={{ full_name: session.profile.full_name, phone: session.profile.phone ?? "", locale: session.profile.locale }} />
          </div>
          <div className="page-card space-y-4 p-6 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("profile.email")}</p>
              <p className="font-medium">{session.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("profile.roles")}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {session.roles.map((r) => (
                  <Badge key={r.id} variant={r.is_primary ? "default" : "secondary"}>
                    {r.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("profile.company")}</p>
              <p className="font-medium">{session.company?.name ?? t("common.na")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("profile.department")}</p>
              <p className="font-medium">{session.profile.department ?? t("common.na")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("profile.job_title")}</p>
              <p className="font-medium">{session.profile.job_title ?? t("common.na")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("profile.linked_driver")}</p>
              {driver ? (
                <Link href={`/drivers/${driver.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {driver.full_name} {driver.employment_number ? `(${driver.employment_number})` : ""}
                </Link>
              ) : (
                <p className="text-muted-foreground">{t("profile.no_linked_driver")}</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="password">
          <div className="page-card max-w-lg p-6">
            <PasswordForm />
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="page-card max-w-lg p-6">
            <NotificationPrefsForm prefs={session.profile.notification_prefs ?? {}} />
          </div>
        </TabsContent>

        <TabsContent value="permissions">
          <div className="page-card p-6">
            <h2 className="text-base font-semibold">{t("profile.permissions")}</h2>
            <p className="text-sm text-muted-foreground">{t("profile.permissions_description")}</p>
            {session.permissions.isOwner ? <p className="mt-4 text-sm">{t("profile.owner_everything")}</p> : null}
            <ul className="mt-4 space-y-2 text-sm">
              {rows
                .filter((r) => r.actions && r.actions.length > 0)
                .map((r) => (
                  <li key={r.resource_key} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <span>{describeGrant(primaryRole || t("profile.role"), r.resource_name, r.actions, r.scope)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
