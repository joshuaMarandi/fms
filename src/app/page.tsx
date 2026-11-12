import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BellRing, ClipboardCheck, KeyRound, MailCheck, Receipt, Route, Smartphone, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { loadPublicPackages, PricingCards } from "@/components/landing/pricing";
import { TONE, CLICKABLE_CARD, type Tone } from "@/components/patterns/tone";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const FEATURES: { key: string; icon: typeof Truck; tone: Tone; href: string }[] = [
  { key: "fleet", icon: Truck, tone: "green", href: "/fleet" },
  { key: "drivers", icon: Users, tone: "blue", href: "/drivers" },
  { key: "inspections", icon: ClipboardCheck, tone: "amber", href: "/inspections" },
  { key: "daily_use", icon: Route, tone: "purple", href: "/daily-use" },
  { key: "expenses", icon: Receipt, tone: "red", href: "/expenses" },
  { key: "access", icon: KeyRound, tone: "slate", href: "/settings/roles" },
];

const STEPS: { n: number; tone: Tone; href: string }[] = [
  { n: 1, tone: "green", href: "/daily-use" },
  { n: 2, tone: "amber", href: "/requests" },
  { n: 3, tone: "blue", href: "/dashboard" },
];

const HIGHLIGHTS = [
  { key: "approvals", icon: MailCheck },
  { key: "reminders", icon: BellRing },
  { key: "mobile", icon: Smartphone },
];

/** Flat dot grid used as decoration on the dark hero (an SVG pattern, not a gradient). */
function DotGrid({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" width="100%" height="100%">
      <defs>
        <pattern id="fms-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#fms-dots)" />
    </svg>
  );
}

/** Public landing page: what the system does, then sign in. */
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const packages = await loadPublicPackages();
  const mainHref = user ? "/dashboard" : "/login";
  const mainLabel = user ? t("landing.cta_dashboard") : t("landing.cta_login");

  return (
    <main className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center">
            <Image src="/brand/fms-logo.png" alt={t("app.name")} width={640} height={306} priority className="h-10 w-auto" />
          </Link>
          <nav className="flex items-center gap-2">
            <a href="#features" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground md:inline">
              {t("landing.nav_modules")}
            </a>
            <a href="#pricing" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:inline">
              {t("landing.pricing_title")}
            </a>
            {!user ? (
              <Button asChild variant="outline" className="hidden h-10 sm:inline-flex">
                <Link href="/register">{t("landing.register_cta")}</Link>
              </Button>
            ) : null}
            <Button asChild className="h-10">
              <Link href={mainHref}>
                {mainLabel} <ArrowRight />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <DotGrid className="pointer-events-none absolute inset-0 text-white/[0.07]" />
        <span className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full border-[28px] border-[#1b5a4c]" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-16 left-1/3 size-40 rounded-full bg-[#d98b1f]/15" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-2 md:items-center md:px-6 md:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-[#d98b1f] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#2a1b00]">
              <span className="size-1.5 rounded-full bg-[#2a1b00]" aria-hidden="true" />
              {t("landing.eyebrow")}
            </p>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-white md:text-5xl">{t("landing.title")}</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed opacity-90 md:text-lg">{t("landing.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 bg-[#d98b1f] px-6 text-base text-[#2a1b00] hover:bg-[#e69c33]">
                <Link href={mainHref}>
                  {mainLabel} <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-sidebar-foreground/40 bg-transparent px-6 text-base text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                <Link href={user ? "#how" : "/register"}>{user ? t("landing.how_title") : t("landing.register_cta")}</Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2">
              {HIGHLIGHTS.map((h) => {
                const Icon = h.icon;
                return (
                  <li key={h.key} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm">
                    <Icon className="size-4 text-[#7fc3b2]" aria-hidden="true" />
                    {t(`landing.highlight.${h.key}`)}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="relative">
            <span className="absolute -bottom-4 -right-4 hidden size-full rounded-xl bg-[#d98b1f] md:block" aria-hidden="true" />
            <Link href={mainHref} className="group relative block aspect-[5/3] overflow-hidden rounded-xl border-4 border-white/10 bg-sidebar-accent">
              <Image src="/pcviewfms.jpg" alt={t("landing.cta_dashboard")} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
            </Link>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 md:px-6">
        <h2 className="text-2xl font-semibold">{t("landing.how_title")}</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ n, tone, href }) => (
            <li key={n}>
              <Link href={href} className={cn("group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-5 ring-0", CLICKABLE_CARD, TONE[tone].ring)}>
                <span className={cn("absolute inset-x-0 top-0 h-1", TONE[tone].bar)} aria-hidden="true" />
                <span className="flex items-center justify-between">
                  <span className={cn("flex size-10 items-center justify-center rounded-full text-base font-semibold", TONE[tone].tile)}>{n}</span>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-semibold">{t(`landing.steps.${n}.title`)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(`landing.steps.${n}.body`)}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="scroll-mt-20 border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
          <h2 className="text-2xl font-semibold">{t("landing.features_title")}</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("landing.features_subtitle")}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              const c = TONE[f.tone];
              return (
                <Link key={f.key} href={f.href} className={cn("group relative flex flex-col overflow-hidden rounded-xl border bg-background p-5 ring-0", CLICKABLE_CARD, c.ring)}>
                  <span className={cn("absolute inset-x-0 top-0 h-1", c.bar)} aria-hidden="true" />
                  <span className={cn("flex size-11 items-center justify-center rounded-xl", c.tile)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold">{t(`landing.feature.${f.key}.title`)}</h3>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{t(`landing.feature.${f.key}.body`)}</p>
                  <span className={cn("mt-4 inline-flex items-center gap-1 text-sm font-medium", c.text)}>
                    {t("landing.open_module")} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {packages.length ? (
        <section id="pricing" className="bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
            <h2 className="text-2xl font-semibold">{t("landing.pricing_title")}</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">{t("landing.pricing_subtitle")}</p>
            <div className="mt-8">
              <PricingCards packages={packages} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <DotGrid className="pointer-events-none absolute inset-0 text-white/[0.06]" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[1fr_320px] md:items-center md:px-6">
          <div>
            <h2 className="text-2xl font-semibold text-white">{t("landing.roles_title")}</h2>
            <p className="mt-3 max-w-2xl opacity-90">{t("landing.roles_body")}</p>
            <Button asChild size="lg" className="mt-6 h-12 bg-[#d98b1f] px-6 text-base text-[#2a1b00] hover:bg-[#e69c33]">
              <Link href={mainHref}>
                {mainLabel} <ArrowRight />
              </Link>
            </Button>
          </div>
          <Link href={mainHref} className="group relative mx-auto block aspect-[2/3] w-56 overflow-hidden rounded-2xl border-4 border-white/10 md:w-full md:max-w-[280px]">
            <Image src="/phoneviewfms.jpg" alt={t("landing.cta_dashboard")} fill sizes="280px" className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground md:flex-row md:px-6">
        <span>{t("landing.footer")}</span>
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          {t("landing.cta_login")}
        </Link>
      </footer>
    </main>
  );
}
