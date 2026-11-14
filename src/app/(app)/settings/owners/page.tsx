import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OwnersClient, type OwnerRow } from "./owners-client";
import { t } from "@/i18n";

/** System owners (owner settings only). */
export default async function OwnersPage() {
  const session = await requireSession();
  if (!session.roles.some((r) => r.is_owner)) redirect("/no-access?resource=settings.owners&action=view");
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_users");
  const owners = ((data ?? []) as (OwnerRow & { is_owner: boolean })[]).filter((u) => u.is_owner);

  return (
    <>
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("settings.title")}
      </Link>
      <PageHeader className="mt-2" title={t("settings.owners.title")} description={t("settings.owners.description")} />
      <OwnersClient owners={owners} me={session.userId} />
    </>
  );
}
