"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const schema = z.object({
  email: z.string().email(t("form.invalid_email")),
  password: z.string().min(1, t("form.required")),
});
type Values = z.infer<typeof schema>;

/** Inputs sit slightly sunk into the card. */
const INPUT = "h-12 rounded-xl border-[#0f3d34]/20 bg-white text-base shadow-[inset_0_2px_0_rgba(15,61,52,0.08)] focus-visible:border-[#0f5c4d]";

export function LoginForm({ next, inactive }: { next: string; inactive: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(inactive ? t("auth.inactive") : null);
  // Signed in and on the way to the dashboard: the button stays pressed until the next page shows.
  const [leaving, setLeaving] = React.useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: Values) {
    if (leaving) return;
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setError(t("auth.invalid_credentials"));
      return;
    }
    setLeaving(true);
    router.replace(next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  const { errors, isSubmitting } = form.formState;
  const busy = isSubmitting || leaving;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate aria-busy={busy}>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={busy} className="space-y-4">
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email" className="text-[#17211e]">
            {t("auth.email")}
          </FieldLabel>
          <Input id="email" type="email" autoComplete="email" inputMode="email" className={INPUT} {...form.register("email")} aria-invalid={!!errors.email} />
          <FieldError>{errors.email?.message}</FieldError>
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password" className="text-[#17211e]">
            {t("auth.password")}
          </FieldLabel>
          <Input id="password" type="password" autoComplete="current-password" className={INPUT} {...form.register("password")} aria-invalid={!!errors.password} />
          <FieldError>{errors.password?.message}</FieldError>
        </Field>
      </fieldset>

      {/* A raised key: it presses down when clicked and stays down (with a spinner) until the sign in finishes. */}
      <button
        type="submit"
        disabled={busy}
        aria-live="polite"
        className={cn(
          "relative flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#0f5c4d] text-base font-semibold text-white outline-none",
          "transition-[transform,box-shadow,background-color] duration-100 ease-out focus-visible:ring-4 focus-visible:ring-[#7fc3b2]/60",
          busy
            ? "translate-y-[5px] cursor-wait bg-[#0d5245] shadow-[0_0_0_0_#0a3a31]"
            : "shadow-[0_5px_0_0_#0a3a31] hover:bg-[#126b5a] active:translate-y-[5px] active:shadow-[0_0_0_0_#0a3a31]",
        )}
      >
        {leaving ? (
          <>
            <Check className="size-5" aria-hidden="true" /> {t("auth.signed_in_opening")}
          </>
        ) : isSubmitting ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" /> {t("auth.signing_in")}
          </>
        ) : (
          <>
            {t("auth.sign_in")} <ArrowRight className="size-5" aria-hidden="true" />
          </>
        )}
      </button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className={cn("font-medium text-[#0f5c4d] underline-offset-4 hover:underline", busy && "pointer-events-none opacity-50")}>
          {t("auth.forgot_password")}
        </Link>
      </p>
    </form>
  );
}
