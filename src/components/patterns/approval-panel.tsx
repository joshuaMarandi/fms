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
import { LINK_TABLES, STAGED_STEPS, currentStep } from "@/lib/approval-steps";
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
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  approver_signature?: SignatureValue | null;
  rejection_reason?: string | null;
  approver_name?: string | null;
  approval_step?: string | null;
};

/** A step already signed (earlier steps of a request with several steps). */
export type StepSignoff = { step: string; signer_name: string | null; created_at: string };

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
  signoffs = [],
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
  /** Steps already approved, for requests with several steps. */
  signoffs?: StepSignoff[];
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

  // Several steps: the step waiting decides who may approve (fleet manager, then HR or the HOD...).
  const steps = STAGED_STEPS[table];
  const waiting = currentStep(table, request);
  const canApprove = (waiting ? can(waiting.resource, "approve") : can(resource, "approve")) && request.status === "submitted";
  // A request raised by someone who may approve it is approved straight away, once the follow-up details are filled.
  const canSelfApprove = !steps && can(resource, "approve") && (request.status === "draft" || request.status === "rejected");
  // Extra inputs (such as the approved amount) belong to the first step only.
  const shownExtras = !steps || waiting?.step === "approval" ? (extraFields ?? []) : [];
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

  function validateExtras() {
    const errs: Record<string, string> = {};
    for (const f of shownExtras) if (f.required && !extra[f.name]) errs[f.name] = t("form.required");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function selfApprove() {
    if (!validateExtras()) {
      toast.error(t("form.fix_errors"));
      return;
    }
    setBusy(true);
    const submitted = await callRpc("submit_request", { p_table: table, p_id: request.id }, revalidate);
    if (!submitted.ok) {
      setBusy(false);
      toast.error(submitted.error);
      return;
    }
    const res = await callRpc("approve_request", { p_table: table, p_id: request.id, p_signature: signature, p_extra: Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== "")) }, revalidate);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else toast.success(t("approval.self_done"));
    router.refresh();
  }

  async function decide() {
    const errs: Record<string, string> = {};
    if (decision === "rejected" && !reason.trim()) errs.reason = t("approval.reason_required");
    if (decision === "approved") {
      for (const f of shownExtras) if (f.required && !extra[f.name]) errs[f.name] = t("form.required");
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

  const approveInputs = (
    <>
      {shownExtras.map((f) => (
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
    </>
  );

  const approvedNow = request.status === "approved" || request.status === "completed";
  const timeline: { label: string; date?: string | null; state: "done" | "danger" | "pending"; who?: string | null }[] = [
    { label: t("status.draft"), date: request.created_at, state: "done" },
    { label: t("status.submitted"), date: request.status === "draft" ? null : (request.submitted_at ?? request.updated_at), state: request.status === "draft" ? "pending" : "done" },
  ];
  if (steps) {
    // Each step in turn: signed, waiting, or (on a rejection) where it stopped.
    const reached = waiting ? steps.indexOf(waiting) : approvedNow ? steps.length : -1;
    steps.forEach((s, i) => {
      const signed = signoffs.filter((x) => x.step === s.step).pop();
      const last = i === steps.length - 1;
      if (request.status === "rejected") {
        timeline.push(signed ? { label: t(s.label), date: signed.created_at, state: "done", who: signed.signer_name } : { label: t(s.label), state: "pending" });
      } else if (i < reached || (last && approvedNow)) {
        timeline.push({ label: t(s.label), date: last ? request.approved_at : signed?.created_at, state: "done", who: last ? (approverName ?? request.approver_name) : signed?.signer_name });
      } else {
        timeline.push({ label: t(s.label), state: "pending" });
      }
    });
    if (request.status === "rejected") timeline.push({ label: t("status.rejected"), date: request.approved_at, state: "danger" });
  } else {
    timeline.push(
      request.status === "rejected"
        ? { label: t("status.rejected"), date: request.approved_at, state: "danger" }
        : { label: t("status.approved"), date: approvedNow ? request.approved_at : null, state: approvedNow ? "done" : "pending" },
    );
  }
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
              ? waiting
                ? `${t("approval.awaiting_step", { step: t(waiting.label) })}. ${t("approval.sent_by_link")}`
                : LINK_TABLES.has(table)
                  ? `${t("approval.awaiting")}. ${t("approval.sent_by_link")}`
                  : t("approval.awaiting")
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
              <span className="absolute -left-6.75 top-0.5 flex size-4 items-center justify-center rounded-full bg-card">
                {step.state === "done" ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : step.state === "danger" ? <XCircle className="size-4 text-danger" aria-hidden="true" /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />}
              </span>
              <span className="font-medium">{step.label}</span>
              {step.date ? <span className="ml-2 text-xs text-muted-foreground">{formatDate(step.date, true)}</span> : null}
              {step.who ? <span className="block text-xs text-muted-foreground">{step.who}</span> : null}
            </li>
          ))}
        </ol>

        {request.status === "rejected" && request.rejection_reason ? (
          <div className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
            <p className="font-medium">{t("approval.reason")}</p>
            <p>{request.rejection_reason}</p>
            {mayEdit && LINK_TABLES.has(table) ? <p className="mt-2 text-xs text-foreground/80">{t("approval.resume_hint")}</p> : null}
          </div>
        ) : null}

        {(request.status === "approved" || request.status === "completed") && request.approver_signature ? (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("approval.signature")}</p>
            <SignatureSummary value={request.approver_signature} />
          </div>
        ) : null}

        {canSelfApprove ? (
          <div className="space-y-4 rounded-lg border border-success/40 bg-success-bg/40 p-4">
            <div>
              <p className="text-sm font-semibold">{t("approval.self_title")}</p>
              <p className="text-xs text-muted-foreground">{t("approval.self_description")}</p>
            </div>
            <div className="space-y-3">{approveInputs}</div>
            <Button type="button" size="lg" className="w-full" onClick={selfApprove} disabled={busy}>
              {busy ? t("common.saving") : t("approval.self_approve")}
            </Button>
            {mayEdit ? (
              <button type="button" className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={submit} disabled={busy}>
                {t("approval.self_other")}
              </button>
            ) : null}
          </div>
        ) : (request.status === "draft" || request.status === "rejected") && mayEdit ? (
          <Button type="button" size="lg" className="w-full" onClick={submit} disabled={busy}>
            <Send /> {t("approval.submit_for_approval")}
          </Button>
        ) : null}

        {canApprove ? (
          <div className="space-y-4 rounded-lg border p-4">
            <RadioGroup value={decision} onValueChange={(v) => setDecision(v as "approved" | "rejected")} className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-success has-data-[state=checked]:bg-success-bg">
                <RadioGroupItem value="approved" id={`dec-approve-${request.id}`} />
                <span className="font-medium">{t("approval.approve")}</span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-danger has-data-[state=checked]:bg-danger-bg">
                <RadioGroupItem value="rejected" id={`dec-reject-${request.id}`} />
                <span className="font-medium">{t("approval.reject")}</span>
              </label>
            </RadioGroup>

            {decision === "approved" ? (
              <div className="space-y-3">
                {approveInputs}
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
