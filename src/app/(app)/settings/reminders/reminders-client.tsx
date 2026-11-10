"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import { FormActions } from "@/components/patterns/form-actions";
import { t } from "@/i18n";

export type ReminderSetting = { id: string; reminder_type: string; lead_days: number; lead_km: number; notify_role_ids: string[]; notify_email: boolean };

export function RemindersClient({ rows, roles, companyId, canEdit }: { rows: ReminderSetting[]; roles: { id: string; name: string }[]; companyId: string; canEdit: boolean }) {
  const router = useRouter();
  const [data, setData] = React.useState(rows);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const supabase = createClient();
    for (const r of data) {
      const payload = { company_id: companyId, reminder_type: r.reminder_type, lead_days: r.lead_days, lead_km: r.lead_km, notify_role_ids: r.notify_role_ids, notify_email: r.notify_email };
      const { error } = r.id ? await supabase.from("reminder_settings").update(payload).eq("id", r.id) : await supabase.from("reminder_settings").insert(payload);
      if (error) {
        toast.error(error.message);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    toast.success(t("settings.reminders.saved"));
    router.refresh();
  }

  const update = (i: number, patch: Partial<ReminderSetting>) => setData(data.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("settings.reminders.notify_roles_hint")}</p>
      <div className="page-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">{t("settings.reminders.type")}</th>
              <th className="p-3 font-medium">{t("settings.reminders.lead_days")}</th>
              <th className="p-3 font-medium">{t("settings.reminders.lead_km")}</th>
              <th className="p-3 font-medium">{t("settings.reminders.notify_roles")}</th>
              <th className="p-3 font-medium">{t("settings.reminders.email")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.reminder_type} className="border-t align-top">
                <td className="p-3 font-medium whitespace-nowrap">{t(`settings.reminders.type.${r.reminder_type}`)}</td>
                <td className="p-3">
                  <Input type="number" min={0} className="h-10 w-24" value={r.lead_days} disabled={!canEdit || r.reminder_type === "next_service"} onChange={(e) => update(i, { lead_days: Number(e.target.value) })} aria-label={t("settings.reminders.lead_days")} />
                </td>
                <td className="p-3">
                  <Input type="number" min={0} className="h-10 w-24" value={r.lead_km} disabled={!canEdit || r.reminder_type !== "next_service"} onChange={(e) => update(i, { lead_km: Number(e.target.value) })} aria-label={t("settings.reminders.lead_km")} />
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <label key={role.id} className="flex min-h-[32px] items-center gap-1.5 rounded-md border px-2 text-xs">
                        <Checkbox checked={r.notify_role_ids.includes(role.id)} disabled={!canEdit} onCheckedChange={(v) => update(i, { notify_role_ids: v ? [...r.notify_role_ids, role.id] : r.notify_role_ids.filter((x) => x !== role.id) })} />
                        {role.name}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  <Switch checked={r.notify_email} disabled={!canEdit} onCheckedChange={(v) => update(i, { notify_email: v })} aria-label={t("settings.reminders.email")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? <FormActions onSave={save} busy={busy} /> : null}
    </div>
  );
}
