"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchSelect } from "@/components/patterns/search-select";
import { decideByLink } from "./actions";

type Option = { value: string; label: string };

/** Approve or reject from the link. The confirmation tick is the signature, in the name of the person the link was sent to. */
export function DecisionForm({
  token,
  table,
  step,
  personName,
  personPosition,
  drivers,
  vehicles,
  expiresAt,
}: {
  token: string;
  table: "leave_requests" | "vehicle_requests";
  step: string;
  personName: string;
  personPosition: string;
  drivers: Option[];
  vehicles: Option[];
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [decision, setDecision] = React.useState<"approved" | "rejected" | "">("");
  const [reason, setReason] = React.useState("");
  const [extra, setExtra] = React.useState<Record<string, string>>({ approver_name: personName, approver_position: personPosition, driver_id: "", vehicle_id: "" });
  const [confirmed, setConfirmed] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<{ decision: "approved" | "rejected"; next: string | null } | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  const fields: { name: string; label: string; kind: "text" | "select"; options?: Option[] }[] =
    step !== "approval"
      ? []
      : table === "vehicle_requests"
        ? [
            { name: "driver_id", label: "Assigned driver", kind: "select", options: drivers },
            { name: "vehicle_id", label: "Assigned vehicle", kind: "select", options: vehicles },
          ]
        : [
            { name: "approver_name", label: "Your name", kind: "text" },
            { name: "approver_position", label: "Your position", kind: "text" },
          ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!decision) errs.decision = "Choose approve or reject.";
    if (decision === "rejected" && !reason.trim()) errs.reason = "Give the reason, so the request can be changed.";
    if (decision === "approved") for (const f of fields) if (!extra[f.name]?.trim()) errs[f.name] = "Required.";
    if (!confirmed) errs.confirm = "Tick to confirm the decision.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFailure(null);
    const res = await decideByLink(token, {
      decision: decision as "approved" | "rejected",
      reason: decision === "rejected" ? reason : undefined,
      extra: decision === "approved" ? Object.fromEntries(fields.map((f) => [f.name, extra[f.name] ?? ""])) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setFailure(res.error);
      return;
    }
    setDone({ decision: decision as "approved" | "rejected", next: res.next });
    router.refresh();
  }

  if (done) {
    return (
      <div className={`flex gap-3 rounded-lg p-4 ${done.decision === "approved" ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`} role="status">
        {done.decision === "approved" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />}
        <div>
          <p className="font-medium">{done.decision === "approved" ? "Approved. Thank you." : "Rejected. Thank you."}</p>
          <p className="mt-1 text-sm">
            {done.decision === "rejected"
              ? "The person who made the request was told the reason by email and SMS."
              : done.next
                ? "The next person was sent the request by email and SMS."
                : "The request is fully approved and the person who made it was told."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4" noValidate>
      <div>
        <p className="font-medium">Your decision</p>
        <p className="text-xs text-muted-foreground">Deciding as {personName || "you"}{expiresAt ? `. This link works until ${expiresAt}.` : "."}</p>
      </div>
      <RadioGroup value={decision} onValueChange={(v) => setDecision(v as "approved" | "rejected")} className="grid gap-2 sm:grid-cols-2" aria-label="Decision">
        <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-success has-data-[state=checked]:bg-success-bg">
          <RadioGroupItem value="approved" id="link-approve" />
          <span className="font-medium">Approve</span>
        </label>
        <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-danger has-data-[state=checked]:bg-danger-bg">
          <RadioGroupItem value="rejected" id="link-reject" />
          <span className="font-medium">Reject</span>
        </label>
      </RadioGroup>
      {errors.decision ? <p className="text-sm text-danger">{errors.decision}</p> : null}

      {decision === "approved" && fields.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.name} data-invalid={!!errors[f.name]}>
              <FieldLabel htmlFor={`link-${f.name}`}>
                {f.label} <span className="text-danger">*</span>
              </FieldLabel>
              {f.kind === "select" ? (
                <SearchSelect id={`link-${f.name}`} value={extra[f.name] ?? ""} onChange={(v) => setExtra({ ...extra, [f.name]: v })} options={f.options ?? []} invalid={!!errors[f.name]} />
              ) : (
                <Input id={`link-${f.name}`} className="h-10" value={extra[f.name] ?? ""} onChange={(e) => setExtra({ ...extra, [f.name]: e.target.value })} aria-invalid={!!errors[f.name]} />
              )}
              {errors[f.name] ? <FieldError>{errors[f.name]}</FieldError> : null}
            </Field>
          ))}
        </div>
      ) : null}

      {decision === "rejected" ? (
        <Field data-invalid={!!errors.reason}>
          <FieldLabel htmlFor="link-reason">
            Reason <span className="text-danger">*</span>
          </FieldLabel>
          <Textarea id="link-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should be changed?" aria-invalid={!!errors.reason} />
          {errors.reason ? <FieldError>{errors.reason}</FieldError> : null}
        </Field>
      ) : null}

      {decision ? (
        <label htmlFor="link-confirm" className="flex cursor-pointer items-start gap-3 rounded-lg bg-muted/50 p-3 text-sm">
          <Checkbox id="link-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
          <span>
            I, <span className="font-medium">{personName || "the person this link was sent to"}</span>, confirm this decision. It is recorded with my name as my signature.
            {errors.confirm ? <span className="block text-danger">{errors.confirm}</span> : null}
          </span>
        </label>
      ) : null}

      {failure ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {failure}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" variant={decision === "rejected" ? "destructive" : "default"} disabled={busy || !decision}>
        {busy ? "Saving..." : decision === "rejected" ? "Reject the request" : "Approve the request"}
      </Button>
    </form>
  );
}
