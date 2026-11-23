"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PenLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignatureField, type SignatureValue } from "@/components/patterns/signature-field";
import { usePermissions } from "@/components/permissions/provider";
import { callRpc } from "@/lib/data/records";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * Before the employee signs: when the month goes to them (by itself on its last day), sending it now
 * or again, and signing here on this device when they are present or have no email or phone.
 */
export function EmployeeSignControls({
  timesheetId,
  employee,
  sentAt,
  linkExpires,
  autoSendOn,
  rejected,
}: {
  timesheetId: string;
  employee: string;
  sentAt: string | null;
  linkExpires: string | null;
  /** The last day of the month (the month is sent at 16:00 that day). */
  autoSendOn: string;
  rejected: boolean;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const [busy, setBusy] = React.useState(false);
  const [signing, setSigning] = React.useState(false);
  const [signature, setSignature] = React.useState<SignatureValue | null>(null);
  const mayAct = can("expenses.timesheet", "edit") || can("expenses.timesheet", "create");

  async function send() {
    setBusy(true);
    const res = await callRpc("timesheet_send_to_employee", { p_id: timesheetId }, ["/expenses/timesheet"]);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("timesheet.sent_to_employee", { name: employee }));
      router.refresh();
    }
  }

  async function signHere() {
    if (!signature) {
      toast.error(t("timesheet.signature_needed"));
      return;
    }
    setBusy(true);
    const res = await callRpc("timesheet_sign_on_device", { p_id: timesheetId, p_signature: signature }, ["/expenses/timesheet"]);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("timesheet.signed_here"));
      router.refresh();
    }
  }

  const open = !!sentAt && !!linkExpires && linkExpires > new Date().toISOString();
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm">
        {open
          ? t("timesheet.waiting_employee", { name: employee, date: formatDate(sentAt, true) })
          : rejected
            ? t("timesheet.rejected_send_again", { name: employee })
            : t("timesheet.auto_send", { name: employee, date: formatDate(autoSendOn) })}
      </p>
      {mayAct ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={open ? "outline" : "default"} className="h-10" onClick={send} disabled={busy}>
            <Send /> {open ? t("timesheet.send_again") : t("timesheet.send_now")}
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => setSigning((x) => !x)} aria-expanded={signing} disabled={busy}>
            <PenLine /> {t("timesheet.sign_here")}
          </Button>
        </div>
      ) : null}
      {mayAct && signing ? (
        <div className="space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">{t("timesheet.sign_here_hint", { name: employee })}</p>
          <SignatureField value={signature} onChange={setSignature} label={t("expenses.timesheet.driver_signature")} signer={{ name: employee }} />
          <Button type="button" className="h-11 w-full" onClick={signHere} disabled={busy || !signature}>
            {busy ? t("common.saving") : t("timesheet.sign_and_send")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
