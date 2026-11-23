"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { callRpc } from "@/lib/data/records";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

/** Sends a departure's or arrival's details (pickup, driver, vehicle) to the traveller by email and SMS. */
export function TravelNotify({
  id,
  path,
  email,
  phone,
  sentAt,
  sentTo,
  canSend,
}: {
  id: string;
  path: string;
  email: string | null;
  phone: string | null;
  sentAt: string | null;
  sentTo: string | null;
  canSend: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const contact = [email, phone].filter(Boolean).join(", ");

  async function send() {
    setBusy(true);
    const res = await callRpc<string>("travel_notify", { p_id: id }, [path, `${path}/${id}`]);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("travel.sent", { to: contact }));
    router.refresh();
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4" aria-hidden="true" /> {t("travel.notify_title")}
        </CardTitle>
        <CardDescription>
          {!contact ? t("travel.notify_no_contact") : sentAt ? t("travel.notify_last_sent", { to: sentTo ?? contact, date: formatDate(sentAt, true) }) : t("travel.notify_not_sent", { to: contact })}
        </CardDescription>
      </CardHeader>
      {canSend && contact ? (
        <CardContent>
          <Button type="button" className="h-10" onClick={send} disabled={busy}>
            <Send /> {sentAt ? t("travel.send_again") : t("travel.send")}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
