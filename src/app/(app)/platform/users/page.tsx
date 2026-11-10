import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlatformUsersTable, type PlatformUser } from "./users-table";
import { t } from "@/i18n";

export default async function PlatformUsersPage() {
  await requirePermission("platform.users", "view");
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_users");
  return (
    <>
      <PageHeader title={t("platform.users.title")} description={t("platform.users.description")} />
      <PlatformUsersTable rows={(data ?? []) as PlatformUser[]} />
    </>
  );
}
