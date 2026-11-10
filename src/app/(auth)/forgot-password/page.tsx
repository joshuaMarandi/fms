import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "./forgot-form";
import { t } from "@/i18n";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title={t("auth.reset_password")} description={t("auth.reset_description")}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
