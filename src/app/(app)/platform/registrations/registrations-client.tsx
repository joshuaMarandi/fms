"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Mail, MapPin, Phone, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/patterns/date-picker";
import { approveRegistration, rejectRegistration } from "../actions";
import type { PackageOption } from "../companies/company-form";
import { daysFromNowISO, formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type Registration = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  vehicles_count: number | null;
  package_id: string | null;
  package_name: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  company_id: string | null;
  created_at: string;
};

export function RegistrationsClient({ rows, packages }: { rows: Registration[]; packages: PackageOption[] }) {
  const [approving, setApproving] = React.useState<Registration | null>(null);
  const [rejecting, setRejecting] = React.useState<Registration | null>(null);
  const pending = rows.filter((r) => r.status === "pending");
  const reviewed = rows.filter((r) => r.status !== "pending");

  return (
    <>
      {pending.length === 0 ? <p className="page-card p-6 text-center text-sm text-muted-foreground">{t("platform.registrations.empty")}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((r) => (
          <article key={r.id} className="page-card flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{r.company_name}</h2>
                <p className="text-sm text-muted-foreground">
                  {r.contact_name} · {t("platform.registrations.received")} {formatDate(r.created_at, true)}
                </p>
              </div>
              <span className="status-chip status-chip-warning">{t("platform.registrations.status.pending")}</span>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                <a href={`mailto:${r.email}`} className="truncate text-primary underline-offset-4 hover:underline">
                  {r.email}
                </a>
              </div>
              {r.phone ? (
                <div className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" aria-hidden="true" /> {r.phone}
                </div>
              ) : null}
              {r.city || r.country ? (
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" /> {[r.city, r.country].filter(Boolean).join(", ")}
                </div>
              ) : null}
              {r.vehicles_count !== null ? (
                <div className="flex items-center gap-2">
                  <Truck className="size-4 text-muted-foreground" aria-hidden="true" /> {r.vehicles_count} {t("platform.registrations.vehicles").toLowerCase()}
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">{t("platform.registrations.requested_package")}:</span> <span className="font-medium">{r.package_name ?? t("common.none")}</span>
            </p>
            {r.message ? <p className="mt-2 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{r.message}</p> : null}
            <div className="mt-auto flex justify-end gap-2 pt-4">
              <Button variant="outline" className="text-danger" onClick={() => setRejecting(r)}>
                <X /> {t("platform.registrations.reject")}
              </Button>
              <Button onClick={() => setApproving(r)}>
                <Check /> {t("platform.registrations.approve")}
              </Button>
            </div>
          </article>
        ))}
      </div>

      {reviewed.length > 0 ? (
        <section className="page-card overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("platform.registrations.company")}</th>
                <th className="py-2 pr-3 font-medium">{t("platform.registrations.contact")}</th>
                <th className="py-2 pr-3 font-medium">{t("platform.registrations.requested_package")}</th>
                <th className="py-2 pr-3 font-medium">{t("platform.registrations.received")}</th>
                <th className="py-2 font-medium">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {reviewed.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-2 pr-3 font-medium">
                    {r.company_id ? (
                      <Link href={`/platform/companies/${r.company_id}`} className="text-primary underline-offset-4 hover:underline">
                        {r.company_name}
                      </Link>
                    ) : (
                      r.company_name
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.contact_name}
                    <span className="block text-xs text-muted-foreground">{r.email}</span>
                  </td>
                  <td className="py-2 pr-3">{r.package_name ?? ""}</td>
                  <td className="py-2 pr-3">{formatDate(r.created_at)}</td>
                  <td className="py-2">
                    <span className={`status-chip ${r.status === "approved" ? "status-chip-success" : "status-chip-danger"}`}>{t(`platform.registrations.status.${r.status}`)}</span>
                    {r.rejection_reason ? <span className="mt-1 block text-xs text-muted-foreground">{r.rejection_reason}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {approving ? <ApproveDialog reg={approving} packages={packages} onClose={() => setApproving(null)} /> : null}
      {rejecting ? <RejectDialog reg={rejecting} onClose={() => setRejecting(null)} /> : null}
    </>
  );
}

function ApproveDialog({ reg, packages, onClose }: { reg: Registration; packages: PackageOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pkg, setPkg] = React.useState(reg.package_id ?? packages.find((p) => p.is_active)?.id ?? "");
  const [status, setStatus] = React.useState<"active" | "trial">("trial");
  const [end, setEnd] = React.useState<string | null>(() => daysFromNowISO(30));
  const [busy, setBusy] = React.useState(false);

  async function approve() {
    setBusy(true);
    const res = await approveRegistration({ id: reg.id, package_id: pkg, status, subscription_end: end });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.data.inviteError) toast.warning(t("platform.registrations.approved_no_invite", { error: res.data.inviteError }));
    else toast.success(t("platform.registrations.approved"));
    onClose();
    router.push(`/platform/companies/${res.data.companyId}`);
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("platform.registrations.approve_title")}: {reg.company_name}
          </DialogTitle>
          <DialogDescription>{t("platform.registrations.approve_description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="ap-pkg">{t("platform.companies.package")}</FieldLabel>
            <Select value={pkg} onValueChange={(x) => setPkg(x ?? "")}>
              <SelectTrigger id="ap-pkg" className="h-10 w-full">
                <SelectValue placeholder={t("common.select_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {packages
                  .filter((p) => p.is_active)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {t("platform.packages.vehicles_up_to", { count: p.max_vehicles })}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ap-status">{t("platform.companies.status")}</FieldLabel>
              <Select value={status} onValueChange={(x) => setStatus((x as "active" | "trial") ?? "trial")}>
                <SelectTrigger id="ap-status" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">{t("platform.status.trial")}</SelectItem>
                  <SelectItem value="active">{t("platform.status.active")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ap-end">{t("platform.companies.subscription_end")}</FieldLabel>
              <DatePicker id="ap-end" value={end} onChange={setEnd} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={approve} disabled={busy || !pkg}>
            <Check /> {t("platform.registrations.approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ reg, onClose }: { reg: Registration; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function reject() {
    if (!reason.trim()) {
      toast.error(t("approval.reason_required"));
      return;
    }
    setBusy(true);
    const res = await rejectRegistration(reg.id, reason.trim());
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("platform.registrations.rejected"));
      onClose();
      router.refresh();
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("platform.registrations.reject")}: {reg.company_name}
          </DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="rj-reason">
            {t("approval.reason")} <span className="text-danger">*</span>
          </FieldLabel>
          <Textarea id="rj-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("approval.reason_placeholder")} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={reject} disabled={busy}>
            {t("platform.registrations.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
