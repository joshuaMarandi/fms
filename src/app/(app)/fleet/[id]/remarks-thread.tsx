"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveRecord } from "@/lib/data/records";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

/** HOD remark: add-only thread with author and date. */
export function RemarksThread({ vehicleId, remarks, canAdd }: { vehicleId: string; remarks: { id: string; body: string; created_at: string; author: string }[]; canAdd: boolean }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    const res = await saveRecord({ table: "vehicle_remarks", values: { vehicle_id: vehicleId, body: body.trim() }, revalidate: [`/fleet/${vehicleId}`] });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      setBody("");
      toast.success(t("common.saved"));
      router.refresh();
    }
  }

  return (
    <div className="page-card p-4 md:p-6">
      <h2 className="mb-4 text-base font-semibold">{t("fleet.hod_remark")}</h2>
      {canAdd ? (
        <div className="mb-6 space-y-2">
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("fleet.remark_placeholder")} aria-label={t("fleet.hod_remark")} />
          <div className="flex justify-end">
            <Button onClick={add} disabled={busy || !body.trim()}>
              <MessageSquare /> {t("fleet.add_remark")}
            </Button>
          </div>
        </div>
      ) : null}
      {remarks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("fleet.no_remarks")}</p>
      ) : (
        <ol className="space-y-3">
          {remarks.map((r) => (
            <li key={r.id} className="rounded-lg border p-3 text-sm">
              <p className="whitespace-pre-wrap">{r.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {r.author} · {formatDate(r.created_at, true)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
