import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { t } from "@/i18n";

/**
 * Auth pages: full-bleed background photo (desktop and phone versions), a flat dark overlay for contrast,
 * and a white card with the form. No gradients.
 */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <main className="relative min-h-svh">
      <Image src="/pcviewfms.jpg" alt="" fill priority sizes="100vw" className="hidden object-cover md:block" />
      <Image src="/phoneviewfms.jpg" alt="" fill priority sizes="100vw" className="object-cover md:hidden" />
      <div className="absolute inset-0 bg-[#0f3d34]/70" aria-hidden="true" />

      <div className="relative z-10 flex min-h-svh flex-col">
        <header className="flex items-center justify-between p-4 md:p-6">
          <Link href="/" className="flex items-center">
            <Image src="/brand/fms-logo-white.png" alt={t("app.name")} width={640} height={306} priority className="h-10 w-auto" />
          </Link>
          <Link href="/" className="flex items-center gap-1 text-sm text-white/90 underline-offset-4 hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("auth.back_home")}
          </Link>
        </header>

        <div className="flex flex-1 items-end justify-center p-4 md:items-center md:p-8">
          <div className="grid w-full max-w-5xl items-center gap-8 md:grid-cols-2">
            <div className="hidden text-white md:block">
              <p className="text-sm font-medium uppercase tracking-wide text-white/80">{t("landing.eyebrow")}</p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight">{t("landing.title")}</h2>
              <p className="mt-4 max-w-md text-white/85">{t("landing.subtitle")}</p>
            </div>
            <section className="w-full rounded-2xl bg-card p-6 shadow-sm md:ml-auto md:max-w-md md:p-8">
              <p className="text-sm text-muted-foreground">{t("auth.welcome_back")}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
              <div className="mt-6">{children}</div>
              <p className="mt-6 text-xs text-muted-foreground">{t("auth.no_account")}</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
