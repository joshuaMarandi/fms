import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { createClient } from "@/lib/supabase/server";
import type { Subscription } from "@/lib/auth/session";
import { formatDate, formatNumber, nowMs } from "@/lib/utils";
import { hasKey, t } from "@/i18n";
import { loadPublicPackages } from "@/components/landing/pricing";
import { PackageChange, type PackageRequest } from "./package-change";

const TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { pending: "warning", trial: "info", active: "success", suspended: "danger", cancelled: "neutral" };

/** The company's package for its Admin, with a request to change it (the owner approves). */
export async function SubscriptionCard({ subscription, vehiclesUsed, companyId, canEdit }: { subscription: Subscription | null; vehiclesUsed: number; companyId: string; canEdit: boolean }) {
  const supabase = await createClient();
  const [packages, { data: requests }] = await Promise.all([
    canEdit ? loadPublicPackages() : Promise.resolve([]),
    supabase.from("package_change_requests").select("id, status, created_at, decided_at, decision_note, to:packages!package_change_requests_to_package_id_fkey(name)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1),
  ]);
  const r = ((requests ?? []) as unknown as { id: string; status: PackageRequest["status"]; created_at: string; decided_at: string | null; decision_note: string | null; to: { name: string } | null }[])[0];
  // A rejection is shown for 30 days; an approval needs no banner (the card already shows the new package).
  const latest: PackageRequest | null = r && (r.status === "pending" || (r.status === "rejected" && r.decided_at && nowMs() - new Date(r.decided_at).getTime() < 30 * 86400000)) ? { id: r.id, status: r.status, created_at: r.created_at, decided_at: r.decided_at, decision_note: r.decision_note, to_name: r.to?.name ?? "" } : null;
  const change = <PackageChange packages={packages} currentId={subscription?.packageId ?? null} vehiclesUsed={vehiclesUsed} latest={latest} canEdit={canEdit} />;

  if (!subscription?.packageId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("subscription.title")}</CardTitle>
          <CardDescription>{t("subscription.none")}</CardDescription>
        </CardHeader>
        <CardContent>{change}</CardContent>
      </Card>
    );
  }
  const { data: resources } = await supabase.from("resources").select("key, name").in("key", subscription.packageKeys);
  const modules = ((resources ?? []) as { key: string; name: string }[]).map((r) => (hasKey(`resource.${r.key}`) ? t(`resource.${r.key}`) : r.name));
  const max = subscription.maxVehicles ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          {t("subscription.title")}
          <StatusChip status={subscription.status} tone={TONES[subscription.status]} label={t(`platform.status.${subscription.status}`)} />
        </CardTitle>
        <CardDescription>{t("subscription.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">{t("subscription.package")}</p>
          <p className="text-lg font-semibold">{subscription.packageName}</p>
          <p className="text-sm text-muted-foreground">
            {subscription.currency} {formatNumber(subscription.price ?? 0)} {t(`platform.packages.period.${subscription.billingPeriod ?? "monthly"}`)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("subscription.renews")}</p>
          <p className="flex items-center gap-2 text-lg font-semibold">
            {subscription.end ? formatDate(subscription.end) : t("subscription.no_end")}
            {subscription.end ? <ReminderChip date={subscription.end} /> : null}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">{t("subscription.vehicles")}</p>
          <p className="text-sm font-medium tabular-nums">{t("subscription.vehicle_limit", { count: vehiclesUsed, max })}</p>
          <Progress className="mt-1" value={max ? Math.min(100, Math.round((vehiclesUsed / max) * 100)) : 0} aria-label={t("subscription.vehicles")} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("subscription.modules")}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {modules.map((m) => (
              <li key={m} className="status-chip status-chip-success">
                {m}
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-3">{change}</div>
      </CardContent>
    </Card>
  );
}
