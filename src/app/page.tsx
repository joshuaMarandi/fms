import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ClipboardCheck, KeyRound, Receipt, Route, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/i18n";

const FEATURES = [
  { key: "fleet", icon: Truck },
  { key: "drivers", icon: Users },
  { key: "inspections", icon: ClipboardCheck },
  { key: "daily_use", icon: Route },
  { key: "expenses", icon: Receipt },
  { key: "access", icon: KeyRound },
];

/** Public landing page: what the system does, then sign in. */
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Truck className="size-5" aria-hidden="true" />
            </span>
            <span className="font-semibold">{t("app.short_name")}</span>
          </Link>
          <Button asChild className="h-10">
            <Link href={user ? "/dashboard" : "/login"}>
              {user ? t("landing.cta_dashboard") : t("landing.cta_login")} <ArrowRight />
            </Link>
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:px-6 md:py-24">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide opacity-80">{t("landing.eyebrow")}</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">{t("landing.title")}</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed opacity-90 md:text-lg">{t("landing.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link href={user ? "/dashboard" : "/login"}>
                  {user ? t("landing.cta_dashboard") : t("landing.cta_login")} <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-sidebar-foreground/40 bg-transparent px-6 text-base text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                <a href="#how">{t("landing.how_title")}</a>
              </Button>
            </div>
          </div>
          <div className="relative aspect-[5/3] overflow-hidden rounded-xl border border-sidebar-accent">
            <Image src="/pcviewfms.jpg" alt="" fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <h2 className="text-2xl font-semibold">{t("landing.how_title")}</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="page-card p-5">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{n}</span>
              <h3 className="mt-3 font-semibold">{t(`landing.steps.${n}.title`)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(`landing.steps.${n}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 md:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article key={f.key} className="page-card p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-semibold">{t(`landing.feature.${f.key}.title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`landing.feature.${f.key}.body`)}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[1fr_320px] md:items-center md:px-6">
          <div>
            <h2 className="text-2xl font-semibold">{t("landing.roles_title")}</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">{t("landing.roles_body")}</p>
            <Button asChild size="lg" className="mt-6 h-12 px-6 text-base">
              <Link href={user ? "/dashboard" : "/login"}>
                {user ? t("landing.cta_dashboard") : t("landing.cta_login")} <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="relative mx-auto aspect-[2/3] w-56 overflow-hidden rounded-2xl border md:w-full md:max-w-[280px]">
            <Image src="/phoneviewfms.jpg" alt="" fill sizes="280px" className="object-cover" />
          </div>
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
