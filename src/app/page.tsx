import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, ClipboardCheck, KeyRound, Receipt, Route, Truck, Users } from "lucide-react";
import { LandingStory, type StorySample } from "@/components/landing/landing-story";
import { RoadBackground } from "@/components/landing/road-background";
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

const HIGHLIGHTS = ["approvals", "reminders", "mobile"];

/**
 * Sample rows shown on the see-through card for each step. Cells starting with ok:, warn: or bad:
 * show as coloured chips.
 */
function storySample(n: number): StorySample {
  const c = (k: string) => t(`landing.sample.col.${k}`);
  const v = (k: string, vars?: Record<string, string | number>) => t(`landing.sample.val.${k}`, vars);
  switch (n) {
    case 1:
      return {
        title: t("landing.sample.1.title"),
        columns: [c("reg"), c("make_model"), c("insurance"), c("status")],
        rows: [
          ["T 123 DKL", "Toyota Hilux", `ok:${v("valid")}`, `ok:${v("in_use")}`],
          ["T 456 DFE", "Land Cruiser 79", `warn:${v("due_days", { count: 12 })}`, `ok:${v("in_use")}`],
          ["T 789 DGA", "Isuzu D-Max", `ok:${v("valid")}`, `warn:${v("out_of_use")}`],
        ],
      };
    case 2:
      return {
        title: t("landing.sample.2.title"),
        columns: [c("reg"), c("last_inspection"), c("remark"), c("actions")],
        rows: [
          ["T 123 DKL", v("today"), `ok:${v("no_anomalies")}`, v("none")],
          ["T 456 DFE", v("today"), `warn:${v("anomaly")}`, `warn:${v("open", { count: 1 })}`],
          ["T 789 DGA", v("yesterday"), `bad:${v("not_safe")}`, `bad:${v("open", { count: 2 })}`],
        ],
      };
    case 3:
      return {
        title: t("landing.sample.3.title"),
        columns: [c("reg"), c("trips"), c("km_run"), c("fuel")],
        rows: [
          ["T 123 DKL", "6", "184 km", "21.5 L"],
          ["T 456 DFE", "3", "96 km", "12.0 L"],
          ["T 789 DGA", "9", "262 km", "30.8 L"],
        ],
      };
    default:
      return {
        title: t("landing.sample.4.title"),
        columns: [c("request"), c("step"), c("status")],
        rows: [
          [v("leave_request"), v("step_approval"), `ok:${v("approved")}`],
          [v("long_trip"), v("step_hse"), `warn:${v("waiting")}`],
          [v("short_trip"), v("step_approval"), `bad:${v("rejected")}`],
        ],
      };
  }
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
    <main className="relative isolate min-h-svh">
      <RoadBackground />
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

      <LandingStory
        title={t("landing.title")}
        subtitle={t("landing.subtitle")}
        mainHref={mainHref}
        mainLabel={mainLabel}
        secondHref={user ? "#how" : "/register"}
        secondLabel={user ? t("landing.how_title") : t("landing.register_cta")}
        highlights={HIGHLIGHTS.map((h) => t(`landing.highlight.${h}`))}
        steps={[1, 2, 3, 4].map((n) => ({
          tag: t(`landing.story.${n}.tag`),
          title: t(`landing.story.${n}.title`),
          body: t(`landing.story.${n}.body`),
          points: [1, 2, 3, 4].map((k) => t(`landing.story.${n}.point${k}`)),
          sample: storySample(n),
        }))}
        scrollHint={t("landing.story.scroll")}
      />

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 md:px-6">
        <h2 className="text-2xl font-semibold text-white">{t("landing.how_title")}</h2>
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

      <section id="features" className="scroll-mt-20 border-y border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
          <h2 className="text-2xl font-semibold text-white">{t("landing.features_title")}</h2>
          <p className="mt-2 max-w-2xl text-white/80">{t("landing.features_subtitle")}</p>
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
        <section id="pricing">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
            <h2 className="text-2xl font-semibold text-white">{t("landing.pricing_title")}</h2>
            <p className="mt-2 max-w-2xl text-white/80">{t("landing.pricing_subtitle")}</p>
            <div className="mt-8">
              <PricingCards packages={packages} />
            </div>
          </div>
        </section>
      ) : null}

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-white/10 px-4 py-8 text-sm text-white/75 md:flex-row md:px-6">
        <span>{t("landing.footer")}</span>
        <Link href="/login" className="font-medium text-[#f0b35a] underline-offset-4 hover:underline">
          {t("landing.cta_login")}
        </Link>
      </footer>
    </main>
  );
}
