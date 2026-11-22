"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { callRpc } from "@/lib/data/records";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

/** Sends a work order to the service provider by email (and shows when it was last sent). */
export function WorkOrderEmail({ id, email, emailedAt, emailedTo, canSend }: { id: string; email: string | null; emailedAt: string | null; emailedTo: string | null; canSend: boolean }) {
  const router = useRouter();
  const [to, setTo] = React.useState(email ?? "");
  const [busy, setBusy] = React.useState(false);

  async function send() {
    setBusy(true);
    const res = await callRpc<string>("send_work_order", { p_id: id, p_email: to.trim() || null }, ["/expenses/maintenance/costs", `/expenses/maintenance/costs/work-orders/${id}`]);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("maint.work_orders.sent", { email: to.trim() }));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" aria-hidden="true" /> {t("maint.work_orders.email_title")}
        </CardTitle>
        <CardDescription>
          {emailedAt ? t("maint.work_orders.last_sent", { email: emailedTo ?? "", date: formatDate(emailedAt, true) }) : t("maint.work_orders.not_sent")}
        </CardDescription>
      </CardHeader>
      {canSend ? (
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="garage@example.com" aria-label={t("maint.work_orders.provider_email")} className="h-10 sm:max-w-sm" />
          <Button type="button" className="h-10" onClick={send} disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())}>
            <Send /> {emailedAt ? t("maint.work_orders.send_again") : t("maint.work_orders.send")}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
