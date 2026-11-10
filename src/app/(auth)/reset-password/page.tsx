import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "./reset-form";
import { t } from "@/i18n";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell title={t("auth.new_password")}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
