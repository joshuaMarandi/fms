import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { t } from "@/i18n";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/dashboard";
  const inactive = sp.inactive === "1";
  return (
    <AuthShell title={t("auth.sign_in_title")} description={t("auth.sign_in_description")}>
      <LoginForm next={next} inactive={inactive} />
    </AuthShell>
  );
}
