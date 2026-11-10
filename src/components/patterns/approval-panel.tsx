"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "./status-chip";
import { SignatureField, SignatureSummary, type SignatureValue } from "./signature-field";
import { ConfirmDialog } from "./confirm-dialog";
import { SearchSelect } from "./search-select";
import { usePermissions } from "@/components/permissions/provider";
import { callRpc } from "@/lib/data/records";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type ApprovalExtraField =
  | { name: string; label: string; control: "select"; options: { value: string; label: string }[]; required?: boolean }
  | { name: string; label: string; control: "number" | "text"; required?: boolean; defaultValue?: string | number };

export type RequestLike = {
  id: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "completed";
  created_at: string;
  created_by?: string | null;
  updated_at?: string;
  approved_at?: string | null;
  approved_by?: string | null;
  approver_signature?: SignatureValue | null;
  rejection_reason?: string | null;
  approver_name?: string | null;
};

/**
 * Shows the request status, the decision radio (Approve or Reject), required reason on reject,
 * signature block and status timeline. Used for vehicle, fuel, maintenance, tyre, wash, leave and timesheets.
 */
export function ApprovalPanel({
  table,
  resource,
  request,
  approverName,
  extraFields,
  revalidate = [],
  canSubmit,
  children,
}: {
  table: string;
  resource: string;
  request: RequestLike;
  approverName?: string | null;
  /** Extra inputs collected on approve (assigned driver, vehicle, approved litres...) */
  extraFields?: ApprovalExtraField[];
  revalidate?: string[];
  /** Whether the current user may submit the draft (defaults to edit permission) */
  canSubmit?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const [decision, setDecision] = React.useState<"approved" | "rejected" | "">("");
  const [reason, setReason] = React.useState("");
  const [signature, setSignature] = React.useState<SignatureValue | null>(null);
  const [extra, setExtra] = React.useState<Record<string, string>>(() => Object.fromEntries((extraFields ?? []).map((f) => [f.name, f.control !== "select" && f.defaultValue !== undefined ? String(f.defaultValue) : ""])));
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const canApprove = can(resource, "approve") && request.status === "submitted";
  const mayEdit = canSubmit ?? can(resource, "edit");

  async function submit() {
    setBusy(true);
    const res = await callRpc("submit_request", { p_table: table, p_id: request.id }, revalidate);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("common.submitted"));
      router.refresh();
    }
  }

  async function decide() {
    const errs: Record<string, string> = {};
    if (decision === "rejected" && !reason.trim()) errs.reason = t("approval.reason_required");
    if (decision === "approved") {
      for (const f of extraFields ?? []) if (f.required && !extra[f.name]) errs[f.name] = t("form.required");
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const res =
      decision === "approved"
        ? await callRpc("approve_request", { p_table: table, p_id: request.id, p_signature: signature, p_extra: Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== "")) }, revalidate)
        : await callRpc("reject_request", { p_table: table, p_id: request.id, p_reason: reason.trim() }, revalidate);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("approval.decided"));
      router.refresh();
    }
  }

  const timeline: { label: string; date?: string | null; state: "done" | "danger" | "pending" }[] = [
    { label: t("status.draft"), date: request.created_at, state: "done" },
    { label: t("status.submitted"), date: request.status === "draft" ? null : request.updated_at, state: request.status === "draft" ? "pending" : "done" },
    request.status === "rejected"
      ? { label: t("status.rejected"), date: request.approved_at, state: "danger" }
      : { label: t("status.approved"), date: request.status === "approved" || request.status === "completed" ? request.approved_at : null, state: request.status === "approved" || request.status === "completed" ? "done" : "pending" },
  ];
  if (request.status === "completed") timeline.push({ label: t("status.completed"), date: request.updated_at, state: "done" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          {t("approval.title")}
          <StatusChip status={request.status} />
        </CardTitle>
        <CardDescription>
          {request.status === "draft"
            ? t("approval.not_submitted")
            : request.status === "submitted"
              ? t("approval.awaiting")
              : request.status === "rejected"
                ? t("approval.rejected_by", { name: approverName ?? request.approver_name ?? "" })
                : t("approval.approved_by", { name: approverName ?? request.approver_name ?? "" })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {children}

        <ol className="relative space-y-3 border-l pl-5" aria-label={t("approval.timeline")}>
          {timeline.map((step) => (
            <li key={step.label} className="relative text-sm">
              <span className="absolute -left-[27px] top-0.5 flex size-4 items-center justify-center rounded-full bg-card">
                {step.state === "done" ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : step.state === "danger" ? <XCircle className="size-4 text-danger" aria-hidden="true" /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />}
              </span>
              <span className="font-medium">{step.label}</span>
              {step.date ? <span className="ml-2 text-xs text-muted-foreground">{formatDate(step.date, true)}</span> : null}
            </li>
          ))}
        </ol>

        {request.status === "rejected" && request.rejection_reason ? (
          <div className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
            <p className="font-medium">{t("approval.reason")}</p>
            <p>{request.rejection_reason}</p>
          </div>
        ) : null}

        {(request.status === "approved" || request.status === "completed") && request.approver_signature ? (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("approval.signature")}</p>
            <SignatureSummary value={request.approver_signature} />
          </div>
        ) : null}

        {(request.status === "draft" || request.status === "rejected") && mayEdit ? (
          <Button type="button" size="lg" className="w-full" onClick={submit} disabled={busy}>
            <Send /> {t("approval.submit_for_approval")}
          </Button>
        ) : null}

        {canApprove ? (
          <div className="space-y-4 rounded-lg border p-4">
            <RadioGroup value={decision} onValueChange={(v) => setDecision(v as "approved" | "rejected")} className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-success has-data-[state=checked]:bg-success-bg">
                <RadioGroupItem value="approved" id={`dec-approve-${request.id}`} />
                <span className="font-medium">{t("approval.approve")}</span>
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-danger has-data-[state=checked]:bg-danger-bg">
                <RadioGroupItem value="rejected" id={`dec-reject-${request.id}`} />
                <span className="font-medium">{t("approval.reject")}</span>
              </label>
            </RadioGroup>

            {decision === "approved" ? (
              <div className="space-y-3">
                {(extraFields ?? []).map((f) => (
                  <Field key={f.name} data-invalid={!!errors[f.name]}>
                    <FieldLabel htmlFor={`extra-${f.name}`}>
                      {f.label}
                      {f.required ? <span className="text-danger"> *</span> : null}
                    </FieldLabel>
                    {f.control === "select" ? (
                      <SearchSelect id={`extra-${f.name}`} value={extra[f.name] ?? ""} onChange={(v) => setExtra({ ...extra, [f.name]: v })} options={f.options} invalid={!!errors[f.name]} />
                    ) : (
                      <Input id={`extra-${f.name}`} type={f.control} inputMode={f.control === "number" ? "decimal" : undefined} className="h-10" value={extra[f.name] ?? ""} onChange={(e) => setExtra({ ...extra, [f.name]: e.target.value })} />
                    )}
                    {errors[f.name] ? <FieldError>{errors[f.name]}</FieldError> : null}
                  </Field>
                ))}
                <SignatureField value={signature} onChange={setSignature} label={t("approval.signature")} />
              </div>
            ) : null}

            {decision === "rejected" ? (
              <Field data-invalid={!!errors.reason}>
                <FieldLabel htmlFor={`reason-${request.id}`}>
                  {t("approval.reason")} <span className="text-danger">*</span>
                </FieldLabel>
                <Textarea id={`reason-${request.id}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("approval.reason_placeholder")} aria-invalid={!!errors.reason} />
                {errors.reason ? <FieldError>{errors.reason}</FieldError> : null}
              </Field>
            ) : null}

            {decision ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" size="lg" className="w-full" variant={decision === "rejected" ? "destructive" : "default"} disabled={busy}>
                    {t("approval.decide")}
                  </Button>
                }
                title={decision === "approved" ? t("approval.confirm_approve") : t("approval.confirm_reject")}
                description={decision === "rejected" ? reason || t("approval.reason_required") : undefined}
                destructive={decision === "rejected"}
                confirmLabel={decision === "approved" ? t("approval.approve") : t("approval.reject")}
                onConfirm={decide}
              />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
