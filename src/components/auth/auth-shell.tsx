import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TiltCard } from "./tilt-card";
import { t } from "@/i18n";

/**
 * Auth pages: full-bleed background photo (desktop and phone versions), a flat dark overlay for contrast,
 * and a raised card with the form. The header sits on the same grid as the content, so the logo lines up
 * with the text below it and "Back to home" with the card. No gradients.
 */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <main className="relative min-h-svh">
      <Image src="/pcviewfms.jpg" alt="" fill priority sizes="100vw" className="hidden object-cover md:block" />
      <Image src="/phoneviewfms.jpg" alt="" fill priority sizes="100vw" className="object-cover md:hidden" />
      <div className="absolute inset-0 bg-[#0f3d34]/75" aria-hidden="true" />

      <div className="relative z-10 flex min-h-svh flex-col px-4 md:px-8">
        <header className="mx-auto flex h-20 w-full max-w-5xl items-center justify-between gap-3">
          <Link href="/" className="flex h-11 items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <Image src="/brand/fms-logo-white.png" alt={t("app.name")} width={640} height={306} priority className="h-11 w-auto" />
          </Link>
          <Link
            href="/"
            className="flex h-11 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("auth.back_home")}
          </Link>
        </header>

        <div className="flex flex-1 items-end justify-center pb-6 md:items-center md:pb-10">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-8 md:grid-cols-2">
            <div className="hidden text-white md:block">
              <p className="inline-flex items-center gap-2 rounded-full bg-[#d98b1f] px-3 py-1 text-xs font-semibold tracking-wide text-[#2a1b00] uppercase">
                <span className="size-1.5 rounded-full bg-[#2a1b00]" aria-hidden="true" />
                {t("landing.eyebrow")}
              </p>
              <h2 className="mt-4 text-4xl leading-tight font-semibold">{t("landing.title")}</h2>
              <p className="mt-4 max-w-md text-white/85">{t("landing.subtitle")}</p>
            </div>
            <TiltCard className="w-full p-6 md:ml-auto md:max-w-md md:p-8">
              <p className="text-sm font-medium text-[#0f5c4d]">{t("auth.welcome_back")}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#17211e]">{title}</h1>
              {description ? <p className="mt-1 text-sm text-[#3f4a46]">{description}</p> : null}
              <div className="mt-6">{children}</div>
              <p className="mt-6 border-t border-[#0f3d34]/10 pt-4 text-xs text-[#3f4a46]">{t("auth.no_account")}</p>
            </TiltCard>
          </div>
        </div>
      </div>
    </main>
  );
}
