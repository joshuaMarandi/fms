"use client";

import * as React from "react";
import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { t } from "@/i18n";

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await requestPasswordReset(email);
    setBusy(false);
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {sent ? (
        <Alert>
          <AlertDescription>{t("auth.reset_sent")}</AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy || sent}>
        {t("auth.send_reset_link")}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          {t("auth.back_to_sign_in")}
        </Link>
      </p>
    </form>
  );
}
