"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Download, Mail, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { SignatureField, SignatureSummary, type SignatureValue } from "@/components/patterns/signature-field";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { DocButton, type DocRef } from "@/components/patterns/doc-button";
import { callRpc } from "@/lib/data/records";
import { cn, formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type JmpReview = {
  id: string;
  step: "prepare" | "requester" | "hse_manager" | "control_room" | "emergency_commander";
  step_order: number;
  required_resource: string;
  reviewer_id: string | null;
  signature: SignatureValue | null;
  signed_at: string | null;
  decision: "approved" | "rejected" | null;
  rejection_reason: string | null;
  docs?: DocRef[];
};

const SIGNING = new Set(["prepare", "requester", "hse_manager"]);

/**
 * The journey management plan of a long trip.
 * Automatic: the HSE manager signs after the approval and the system builds the signed JMP.
 * Manual: the JMP is prepared and uploaded, signed by the requester, then signed and attached by HSE,
 * all before the fleet manager approves. In both, the control room and the emergency response
 * commander are emailed once it is complete; they do not sign.
 */
export function JmpReviewPanel({
  requestId,
  reviews,
  method,
  actionableId,
  monitorsNotifiedAt,
  approved,
}: {
  requestId: string;
  reviews: JmpReview[];
  method: "automatic" | "manual";
  /** The step the signed-in person may do now. */
  actionableId: string | null;
  monitorsNotifiedAt: string | null;
  approved: boolean;
}) {
  const router = useRouter();
  const [signature, setSignature] = React.useState<SignatureValue | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const steps = reviews.filter((r) => SIGNING.has(r.step));
  const blocked = steps.some((r) => r.decision === "rejected");
  const complete = steps.length > 0 && steps.every((r) => r.decision === "approved") && approved;
  const hseFiles = steps.find((r) => r.step === "hse_manager")?.docs ?? [];
  const previousFiles = (r: JmpReview) => [...steps].reverse().find((x) => x.step_order < r.step_order && (x.docs?.length ?? 0) > 0)?.docs ?? [];

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
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          {t("daily_use.trips.jmp_review")}
          <span className="status-chip status-chip-neutral">{t(`jmp.method.${method}`)}</span>
        </CardTitle>
        <CardDescription>{t(`jmp.method.${method}.hint`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {complete ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/40 bg-success-bg p-3 text-sm">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            <span className="flex-1 font-medium text-success">{t("jmp.complete")}</span>
            {method === "manual" ? (
              <DocButton docs={hseFiles} label={t("jmp.download_signed")} />
            ) : (
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link href={`/documents/vehicle_requests/${requestId}`} target="_blank">
                  <Download /> {t("jmp.download_signed")}
                </Link>
              </Button>
            )}
          </div>
        ) : null}

        <ol className="space-y-3">
          {steps.map((r) => {
            const mine = r.id === actionableId && !blocked && r.decision === null;
            const needsFile = method === "manual";
            const prev = previousFiles(r);
            return (
              <li key={r.id} className={cn("rounded-lg border p-3", mine && "border-primary bg-primary/5")}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5">
                    {r.decision === "approved" ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" /> : r.decision === "rejected" ? <XCircle className="size-5 text-danger" aria-hidden="true" /> : <CircleDashed className="size-5 text-muted-foreground" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {r.step_order}. {t(`jmp.step.${r.step}`)}
                      {r.docs && r.docs.length ? <DocButton docs={r.docs} compact /> : null}
                    </p>
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
                        <p className="text-sm">{t(`jmp.todo.${r.step}${needsFile ? "" : ".auto"}`)}</p>
                        {needsFile && prev.length ? (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">{t("jmp.previous_file")}</span>
                            <DocButton docs={prev} compact />
                          </div>
                        ) : null}
                        {needsFile ? (
                          <AttachmentsBox table="jmp_reviews" rowId={r.id} resource="daily_use.trip_requests" bucket="jmp" labels={[t(`jmp.file.${r.step}`)]} multiple={false} />
                        ) : null}
                        <SignatureField value={signature} onChange={setSignature} />
                        <Field>
                          <FieldLabel htmlFor={`jmp-reason-${r.id}`}>{t("approval.reason")}</FieldLabel>
                          <Textarea id={`jmp-reason-${r.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("approval.reason_placeholder")} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <ConfirmDialog
                            trigger={
                              <Button type="button" disabled={busy || !signature}>
                                {t(r.step === "prepare" ? "jmp.confirm_prepared" : "daily_use.trips.jmp_sign")}
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
          <li className="rounded-lg border border-dashed p-3">
            <div className="flex items-start gap-3">
              <Mail className={cn("mt-0.5 size-5", monitorsNotifiedAt ? "text-success" : "text-muted-foreground")} aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium">{t("jmp.monitors")}</p>
                <p className="text-xs text-muted-foreground">{monitorsNotifiedAt ? t("jmp.monitors_sent", { date: formatDate(monitorsNotifiedAt, true) }) : t("jmp.monitors_wait")}</p>
              </div>
            </div>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
