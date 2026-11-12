"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { formatDate } from "@/lib/utils";
import { decidePackageChange } from "../../package-requests";
import { t } from "@/i18n";

export type PendingPackageRequest = { id: string; from_name: string; to_name: string; note: string | null; requester: string | null; created_at: string; vehicles: number; to_max: number };

/** Owner's decision on a company's request for another package. */
export function PackageRequestPanel({ request }: { request: PendingPackageRequest }) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const tooSmall = request.vehicles > request.to_max;

  async function decide(approve: boolean) {
    if (!approve && !reason.trim()) {
      toast.error(t("platform.package_request.reason_required"));
      return;
    }
    setBusy(true);
    const res = await decidePackageChange(request.id, approve, reason);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(approve ? t("platform.package_request.approved") : t("platform.package_request.rejected"));
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#d98b1f]/60 bg-card">
      <span className="block h-1 bg-[#d98b1f]" aria-hidden="true" />
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_320px] md:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-warning">{t("platform.package_request.title")}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold">
            {request.from_name} <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /> {request.to_name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{[request.requester, formatDate(request.created_at, true)].filter(Boolean).join(" · ")}</p>
          {request.note ? <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">{request.note}</p> : null}
          {tooSmall ? <p className="mt-3 text-sm text-danger">{t("platform.package_request.too_small", { count: request.vehicles, max: request.to_max })}</p> : null}
        </div>
        <div className="space-y-3">
          <Field>
            <FieldLabel htmlFor="pr-reason">{t("platform.package_request.reason")}</FieldLabel>
            <Textarea id="pr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("platform.package_request.reason_placeholder")} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10 flex-1" disabled={busy || tooSmall} onClick={() => decide(true)}>
              <Check /> {t("platform.package_request.approve")}
            </Button>
            <Button variant="outline" className="h-10 flex-1 text-danger" disabled={busy} onClick={() => decide(false)}>
              <X /> {t("platform.package_request.reject")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
