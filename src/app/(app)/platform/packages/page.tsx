import Link from "next/link";
import { Check, Plus, Truck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "../shared";
import { hasKey, t } from "@/i18n";

export default async function PackagesPage() {
  await requirePermission("platform.packages", "view");
  const supabase = await createClient();
  const [{ data: packages }, { data: keys }, { data: resources }, { data: companies }] = await Promise.all([
    supabase.from("packages").select("*").is("deleted_at", null).order("sort_order").order("price"),
    supabase.from("package_resources").select("package_id, resource_key"),
    supabase.from("resources").select("key, name"),
    supabase.from("companies").select("package_id").is("deleted_at", null),
  ]);
  const names = new Map(((resources ?? []) as { key: string; name: string }[]).map((r) => [r.key, hasKey(`resource.${r.key}`) ? t(`resource.${r.key}`) : r.name]));
  const using = new Map<string, number>();
  for (const c of (companies ?? []) as { package_id: string | null }[]) if (c.package_id) using.set(c.package_id, (using.get(c.package_id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title={t("platform.packages.title")}
        description={t("platform.packages.description")}
        actions={
          <Button asChild className="h-10">
            <Link href="/platform/packages/new">
              <Plus /> {t("platform.packages.new")}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {((packages ?? []) as Record<string, unknown>[]).map((p) => {
          const mods = ((keys ?? []) as { package_id: string; resource_key: string }[]).filter((k) => k.package_id === p.id).map((k) => names.get(k.resource_key) ?? k.resource_key);
          return (
            <Link key={p.id as string} href={`/platform/packages/${p.id}`} className="page-card flex flex-col p-5 transition-colors hover:bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{p.name as string}</h2>
                <div className="flex gap-1">
                  {!p.is_active ? <Badge variant="secondary">{t("platform.packages.inactive")}</Badge> : null}
                  {!p.is_public ? <Badge variant="secondary">{t("platform.packages.hidden")}</Badge> : null}
                </div>
              </div>
              {p.description ? <p className="mt-1 text-sm text-muted-foreground">{p.description as string}</p> : null}
              <p className="mt-4 text-2xl font-semibold tabular-nums">
                {formatPrice(p.price as number, p.currency as string)} <span className="text-sm font-normal text-muted-foreground">{t(`platform.packages.period.${p.billing_period}`)}</span>
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm">
                <Truck className="size-4 text-primary" aria-hidden="true" /> {t("platform.packages.vehicles_up_to", { count: p.max_vehicles as number })}
              </p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {mods.map((m) => (
                  <li key={m} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> {m}
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-4 text-xs text-muted-foreground">{t("platform.packages.companies_using", { count: using.get(p.id as string) ?? 0 })}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
