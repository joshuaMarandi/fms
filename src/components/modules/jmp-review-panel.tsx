"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Printer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { SignatureField, SignatureSummary, type SignatureValue } from "@/components/patterns/signature-field";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { usePermissions } from "@/components/permissions/provider";
import { callRpc } from "@/lib/data/records";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type JmpReview = {
  id: string;
  step: "hse_manager" | "control_room" | "emergency_commander";
  step_order: number;
  required_resource: string;
  reviewer_id: string | null;
  signature: SignatureValue | null;
  signed_at: string | null;
  decision: "approved" | "rejected" | null;
  rejection_reason: string | null;
};

/** Three signature steps for a long trip JMP, each needing its own role. */
export function JmpReviewPanel({ requestId, reviews }: { requestId: string; reviews: JmpReview[] }) {
  const router = useRouter();
  const { can } = usePermissions();
  const [signature, setSignature] = React.useState<SignatureValue | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const next = reviews.find((r) => r.decision === null);
  const blocked = reviews.some((r) => r.decision === "rejected");

  async function sign(step: string, decision: "approved" | "rejected") {
    if (decision === "rejected" && !reason.trim()) {
      toast.error(t("approval.reason_required"));
      return;
    }
    setBusy(true);
    const res = await callRpc("sign_jmp", { p_request_id: requestId, p_step: step, p_decision: decision, p_signature: signature, p_reason: reason.trim() || null }, ["/daily-use/trip-requests", `/daily-use/trip-requests/${requestId}`]);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("daily_use.trips.jmp_signed"));
      setSignature(null);
      setReason("");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {t("daily_use.trips.jmp_review")}
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> {t("daily_use.trips.jmp_print")}
          </Button>
        </CardTitle>
        <CardDescription>{t("daily_use.trips.jmp")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {reviews.map((r) => {
            const mine = next?.id === r.id && !blocked && can(r.required_resource, "approve");
            return (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5">
                    {r.decision === "approved" ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" /> : r.decision === "rejected" ? <XCircle className="size-5 text-danger" aria-hidden="true" /> : <CircleDashed className="size-5 text-muted-foreground" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {r.step_order}. {t(`daily_use.trips.jmp.${r.step}`)}
                    </p>
                    <p className="text-xs text-muted-foreground">{t(`resource.${r.required_resource}`)}</p>
                    {r.decision ? (
                      <div className="mt-2 text-sm">
                        <SignatureSummary value={r.signature} />
                        {r.signed_at ? <p className="text-xs text-muted-foreground">{formatDate(r.signed_at, true)}</p> : null}
                        {r.rejection_reason ? <p className="mt-1 rounded bg-danger-bg p-2 text-danger">{r.rejection_reason}</p> : null}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">{t("status.awaiting")}</p>
                    )}
                    {mine ? (
                      <div className="mt-3 space-y-3">
                        <SignatureField value={signature} onChange={setSignature} />
                        <Field>
                          <FieldLabel htmlFor={`jmp-reason-${r.id}`}>{t("approval.reason")}</FieldLabel>
                          <Textarea id={`jmp-reason-${r.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("approval.reason_placeholder")} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <ConfirmDialog
                            trigger={
                              <Button type="button" disabled={busy || !signature}>
                                {t("daily_use.trips.jmp_sign")}
                              </Button>
                            }
                            title={t("approval.confirm_approve")}
                            confirmLabel={t("common.sign")}
                            onConfirm={() => sign(r.step, "approved")}
                          />
                          <ConfirmDialog
                            trigger={
                              <Button type="button" variant="destructive" disabled={busy}>
                                {t("daily_use.trips.jmp_reject")}
                              </Button>
                            }
                            title={t("approval.confirm_reject")}
                            description={reason || t("approval.reason_required")}
                            destructive
                            confirmLabel={t("approval.reject")}
                            onConfirm={() => sign(r.step, "rejected")}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
