"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { callRpc } from "@/lib/data/records";
import { t } from "@/i18n";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Where approved outstation allowances and petty cash go. Finance has no account: email only. */
export function FinanceEmailsCard({ emails, canEdit }: { emails: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = React.useState(emails.join(", "));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    const list = [...new Set(value.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const bad = list.filter((e) => !EMAIL.test(e));
    if (bad.length) {
      setError(t("settings.finance.invalid", { emails: bad.join(", ") }));
      return;
    }
    setError(null);
    setBusy(true);
    const res = await callRpc("set_company_setting", { p_key: "finance_emails", p_value: list }, ["/settings/company"]);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setValue(list.join(", "));
    toast.success(t("settings.company.saved"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.finance.title")}</CardTitle>
        <CardDescription>{t("settings.finance.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field data-invalid={!!error} className="flex-1">
            <FieldLabel htmlFor="finance-emails">{t("settings.finance.emails")}</FieldLabel>
            <Input id="finance-emails" className="h-10" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit || busy} placeholder="finance@company.co.tz" aria-invalid={!!error} />
            {error ? <FieldError>{error}</FieldError> : <FieldDescription>{t("settings.finance.hint")}</FieldDescription>}
          </Field>
          {canEdit ? (
            <Button type="submit" className="h-10" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
