"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/permissions/provider";
import { LOCALES, t } from "@/i18n";

export function ProfileForm({ profile }: { profile: { full_name: string; phone: string; locale: string } }) {
  const session = useSession();
  const router = useRouter();
  const [values, setValues] = React.useState(profile);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ full_name: values.full_name, phone: values.phone || null, locale: values.locale }).eq("id", session.userId);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("profile.updated"));
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="full_name">{t("profile.name")}</FieldLabel>
        <Input id="full_name" required value={values.full_name} onChange={(e) => setValues({ ...values, full_name: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel htmlFor="phone">{t("profile.phone")}</FieldLabel>
        <Input id="phone" type="tel" inputMode="tel" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel htmlFor="locale">{t("profile.language")}</FieldLabel>
        <Select value={values.locale} onValueChange={(v) => setValues({ ...values, locale: v ?? "en" })}>
          <SelectTrigger id="locale" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error(t("auth.passwords_differ"));
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("auth.password_updated"));
      setPassword("");
      setConfirm("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="new_password">{t("auth.new_password")}</FieldLabel>
        <Input id="new_password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field>
        <FieldLabel htmlFor="confirm_password">{t("auth.confirm_password")}</FieldLabel>
        <Input id="confirm_password" type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {t("auth.update_password")}
        </Button>
      </div>
    </form>
  );
}

export function NotificationPrefsForm({ prefs }: { prefs: { email?: boolean; in_app?: boolean } }) {
  const session = useSession();
  const [email, setEmail] = React.useState(prefs.email ?? true);
  const [inApp, setInApp] = React.useState(prefs.in_app ?? true);

  async function save(next: { email: boolean; in_app: boolean }) {
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ notification_prefs: next }).eq("id", session.userId);
    if (error) toast.error(error.message);
    else toast.success(t("common.saved"));
  }

  return (
    <div className="space-y-4">
      <Field orientation="horizontal">
        <div className="flex-1">
          <FieldLabel htmlFor="pref_email">{t("profile.notifications_email")}</FieldLabel>
          <FieldDescription>{t("settings.reminders.email")}</FieldDescription>
        </div>
        <Switch
          id="pref_email"
          checked={email}
          onCheckedChange={(v) => {
            setEmail(v);
            save({ email: v, in_app: inApp });
          }}
        />
      </Field>
      <Field orientation="horizontal">
        <div className="flex-1">
          <FieldLabel htmlFor="pref_in_app">{t("profile.notifications_in_app")}</FieldLabel>
        </div>
        <Switch
          id="pref_in_app"
          checked={inApp}
          onCheckedChange={(v) => {
            setInApp(v);
            save({ email, in_app: v });
          }}
        />
      </Field>
    </div>
  );
}
