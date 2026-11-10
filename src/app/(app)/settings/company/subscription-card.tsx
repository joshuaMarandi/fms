import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ReminderChip, StatusChip } from "@/components/patterns/status-chip";
import { createClient } from "@/lib/supabase/server";
import type { Subscription } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

const TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { pending: "warning", trial: "info", active: "success", suspended: "danger", cancelled: "neutral" };

/** Read-only view of the company's package for its Admin. Only the owner can change it. */
export async function SubscriptionCard({ subscription, vehiclesUsed }: { subscription: Subscription | null; vehiclesUsed: number }) {
  if (!subscription?.packageId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("subscription.title")}</CardTitle>
          <CardDescription>{t("subscription.none")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const supabase = await createClient();
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
      </CardContent>
    </Card>
  );
}
