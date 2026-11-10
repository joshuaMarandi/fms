import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";
import { loadPublicPackages } from "@/components/landing/pricing";
import { RegisterForm } from "./register-form";
import { t } from "@/i18n";

export const metadata: Metadata = { title: "Register your company" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const packages = await loadPublicPackages();
  const selected = typeof sp.package === "string" ? sp.package : packages[0]?.id ?? "";

  return (
    <main className="relative min-h-svh">
      <Image src="/pcviewfms.jpg" alt="" fill priority sizes="100vw" className="hidden object-cover md:block" />
      <Image src="/phoneviewfms.jpg" alt="" fill priority sizes="100vw" className="object-cover md:hidden" />
      <div className="absolute inset-0 bg-[#0f3d34]/75" aria-hidden="true" />
      <div className="relative z-10 flex min-h-svh flex-col">
        <header className="flex items-center justify-between p-4 md:p-6">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Truck className="size-5" aria-hidden="true" />
            </span>
            <span className="font-semibold">{t("app.short_name")}</span>
          </Link>
          <Link href="/" className="flex items-center gap-1 text-sm text-white/90 underline-offset-4 hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("auth.back_home")}
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center p-4 md:p-8">
          <section className="w-full max-w-2xl rounded-2xl bg-card p-6 md:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">{t("register.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("register.description")}</p>
            <div className="mt-6">
              <RegisterForm packages={packages.map((p) => ({ id: p.id, name: p.name, max_vehicles: p.max_vehicles, price: p.price, currency: p.currency, billing_period: p.billing_period }))} selected={selected} />
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              {t("register.have_account")}{" "}
              <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                {t("auth.sign_in")}
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
