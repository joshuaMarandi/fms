"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { t } from "@/i18n";

const schema = z.object({
  email: z.string().email(t("form.invalid_email")),
  password: z.string().min(1, t("form.required")),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ next, inactive }: { next: string; inactive: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(inactive ? t("auth.inactive") : null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: Values) {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setError(t("auth.invalid_credentials"));
      return;
    }
    router.replace(next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
        <Input id="email" type="email" autoComplete="email" inputMode="email" {...form.register("email")} aria-invalid={!!errors.email} />
        <FieldError>{errors.email?.message}</FieldError>
      </Field>
      <Field data-invalid={!!errors.password}>
        <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
        <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} aria-invalid={!!errors.password} />
        <FieldError>{errors.password?.message}</FieldError>
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("auth.signing_in") : t("auth.sign_in")}
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          {t("auth.forgot_password")}
        </Link>
      </p>
    </form>
  );
}
