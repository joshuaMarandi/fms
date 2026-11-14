"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { StatusChip } from "@/components/patterns/status-chip";
import { formatDate } from "@/lib/utils";
import { inviteOwner, removeOwner } from "./actions";
import { t } from "@/i18n";

export type OwnerRow = { id: string; full_name: string; email: string | null; phone: string | null; is_active: boolean; created_at: string };

/** System owners: who they are, add another, remove one (never yourself, never the last). */
export function OwnersClient({ owners, me }: { owners: OwnerRow[]; me: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ full_name: "", email: "", phone: "" });
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await inviteOwner(v);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("settings.owners.invited", { email: v.email }));
    setOpen(false);
    setV({ full_name: "", email: "", phone: "" });
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-end">
        <Button className="h-10" onClick={() => setOpen(true)}>
          <UserPlus /> {t("settings.owners.add")}
        </Button>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {owners.map((o) => (
          <li key={o.id} className="page-card flex items-start gap-3 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              <ShieldCheck className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{o.full_name}</span>
                {o.id === me ? <span className="status-chip status-chip-info">{t("settings.owners.you")}</span> : null}
                {!o.is_active ? <StatusChip status="inactive" /> : null}
              </span>
              <span className="block truncate text-sm text-muted-foreground">{[o.email, o.phone].filter(Boolean).join(" · ")}</span>
              <span className="block text-xs text-muted-foreground">{t("settings.owners.since", { date: formatDate(o.created_at) })}</span>
            </span>
            {o.id !== me && owners.length > 1 ? (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" className="text-danger">
                    <UserMinus /> {t("settings.owners.remove")}
                  </Button>
                }
                title={t("settings.owners.remove_title", { name: o.full_name })}
                description={t("settings.owners.remove_confirm")}
                destructive
                confirmLabel={t("settings.owners.remove")}
                onConfirm={async () => {
                  const res = await removeOwner(o.id);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success(t("settings.owners.removed"));
                    router.refresh();
                  }
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.owners.add")}</DialogTitle>
            <DialogDescription>{t("settings.owners.add_description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="ow-name">{t("settings.users.name")}</FieldLabel>
              <Input id="ow-name" required className="h-10" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ow-email">{t("settings.users.email")}</FieldLabel>
              <Input id="ow-email" type="email" required className="h-10" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ow-phone">{t("settings.users.phone")}</FieldLabel>
              <Input id="ow-phone" type="tel" className="h-10" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
              <FieldDescription>{t("settings.owners.phone_hint")}</FieldDescription>
            </Field>
            <p className="rounded-lg bg-warning-bg p-3 text-sm text-warning">{t("settings.owners.warning")}</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {t("settings.owners.send")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
