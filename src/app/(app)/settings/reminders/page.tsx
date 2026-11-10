import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RemindersClient, type ReminderSetting } from "./reminders-client";
import { t } from "@/i18n";

const TYPES = ["insurance_end", "inspection_renewal", "third_party_renewal", "next_service", "licence_expiry", "osha_redo", "training_refresher"];

export default async function RemindersSettingsPage() {
  const session = await requirePermission("settings.reminders", "view");
  const supabase = await createClient();
  const companyId = session.profile.company_id!;
  const [{ data: settings }, { data: roles }] = await Promise.all([
    supabase.from("reminder_settings").select("*").eq("company_id", companyId).is("deleted_at", null),
    supabase.from("roles").select("id, name").order("name"),
  ]);
  const rows: ReminderSetting[] = TYPES.map((type) => {
    const s = ((settings ?? []) as Record<string, unknown>[]).find((x) => x.reminder_type === type);
    return {
      id: (s?.id as string) ?? "",
      reminder_type: type,
      lead_days: (s?.lead_days as number) ?? 30,
      lead_km: (s?.lead_km as number) ?? 500,
      notify_role_ids: (s?.notify_role_ids as string[]) ?? [],
      notify_email: (s?.notify_email as boolean) ?? true,
    };
  });
  return (
    <>
      <PageHeader title={t("settings.reminders.title")} description={t("settings.reminders.description")} />
      <RemindersClient rows={rows} roles={(roles ?? []) as { id: string; name: string }[]} companyId={companyId} canEdit={session.can("settings.reminders", "edit")} />
    </>
  );
}
