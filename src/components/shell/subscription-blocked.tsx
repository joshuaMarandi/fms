import { PauseCircle } from "lucide-react";
import type { Subscription } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

/** Shown instead of every page when the company is suspended, pending, cancelled, expired or has no package. */
export function SubscriptionBlocked({ subscription, companyName }: { subscription: Subscription | null; companyName: string | null }) {
  let reason = t("subscription.blocked.no_package");
  if (subscription) {
    if (subscription.status === "suspended") reason = t("subscription.blocked.suspended");
    else if (subscription.status === "pending") reason = t("subscription.blocked.pending");
    else if (subscription.status === "cancelled") reason = t("subscription.blocked.cancelled");
    else if (subscription.end) reason = t("subscription.blocked.expired", { date: formatDate(subscription.end) });
  }
  return (
    <div className="page-card mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-bg text-warning">
        <PauseCircle className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">{t("subscription.blocked.title")}</h1>
      {companyName ? <p className="mt-1 text-sm font-medium">{companyName}</p> : null}
      <p className="mt-3 text-sm text-muted-foreground">{reason}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t("subscription.blocked.help")}</p>
      <form action="/auth/signout" method="post" className="mt-6">
        <button type="submit" className="text-sm text-primary underline-offset-4 hover:underline">
          {t("nav.sign_out")}
        </button>
      </form>
    </div>
  );
}
