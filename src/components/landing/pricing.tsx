import Link from "next/link";
import { Check, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

export type PublicPackage = { id: string; name: string; description: string | null; price: number; currency: string; billing_period: string; max_vehicles: number; modules: string[] };

export async function loadPublicPackages(opts: { publicOnly?: boolean } = {}): Promise<PublicPackage[]> {
  const supabase = await createClient();
  let q = supabase.from("packages").select("id, name, description, price, currency, billing_period, max_vehicles").eq("is_active", true).is("deleted_at", null);
  if (opts.publicOnly !== false) q = q.eq("is_public", true);
  const [{ data: packages }, { data: keys }, { data: resources }] = await Promise.all([
    q.order("sort_order").order("price"),
    supabase.from("package_resources").select("package_id, resource_key"),
    supabase.from("resources").select("key, name, sort_order"),
  ]);
  const res = new Map(((resources ?? []) as { key: string; name: string; sort_order: number }[]).map((r) => [r.key, r]));
  return ((packages ?? []) as Omit<PublicPackage, "modules">[]).map((p) => ({
    ...p,
    price: Number(p.price),
    modules: ((keys ?? []) as { package_id: string; resource_key: string }[])
      .filter((k) => k.package_id === p.id)
      .map((k) => res.get(k.resource_key))
      .filter((r): r is { key: string; name: string; sort_order: number } => !!r)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => (hasKey(`resource.${r.key}`) ? t(`resource.${r.key}`) : r.name)),
  }));
}

export function PricingCards({ packages }: { packages: PublicPackage[] }) {
  if (packages.length === 0) return null;
  const featured = packages.length >= 3 ? packages[Math.floor(packages.length / 2)]!.id : null;
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {packages.map((p) => (
        <article key={p.id} className={`page-card flex flex-col p-6 ${p.id === featured ? "border-2 border-primary" : ""}`}>
          <h3 className="text-lg font-semibold">{p.name}</h3>
          {p.description ? <p className="mt-1 text-sm text-muted-foreground">{p.description}</p> : null}
          <p className="mt-5 text-3xl font-semibold tabular-nums">
            <span className="text-base font-medium text-muted-foreground">{p.currency}</span> {formatNumber(p.price)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">{t(`platform.packages.period.${p.billing_period}`)}</span>
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm font-medium">
            <Truck className="size-4 text-primary" aria-hidden="true" /> {t("platform.packages.vehicles_up_to", { count: p.max_vehicles })}
          </p>
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("landing.pricing_includes")}</p>
          <ul className="mt-2 space-y-2 text-sm">
            {p.modules.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> {m}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" variant={p.id === featured ? "default" : "outline"} className="mt-auto h-12 w-full">
            <Link href={`/register?package=${p.id}`}>{t("landing.pricing_cta")}</Link>
          </Button>
        </article>
      ))}
    </div>
  );
}
