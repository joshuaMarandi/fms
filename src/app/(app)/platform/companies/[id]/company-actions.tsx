"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, Pause, Play, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { enterCompany, inviteCompanyAdmin, setCompanyStatus } from "../../actions";
import { t } from "@/i18n";

export function CompanyActions({ companyId, status }: { companyId: string; status: string }) {
  const router = useRouter();
  const [entering, startEnter] = React.useTransition();
  const live = status === "active" || status === "trial";

  return (
    <>
      <Button variant="outline" className="h-10" disabled={entering} onClick={() => startEnter(() => enterCompany(companyId))} title={t("platform.companies.enter_description")}>
        <LogIn /> {t("platform.companies.enter")}
      </Button>
      {live ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="h-10 text-danger">
              <Pause /> {t("platform.companies.suspend")}
            </Button>
          }
          description={t("platform.companies.suspend_confirm")}
          destructive
          confirmLabel={t("platform.companies.suspend")}
          onConfirm={async () => {
            const res = await setCompanyStatus(companyId, "suspended");
            if (!res.ok) toast.error(res.error);
            else router.refresh();
          }}
        />
      ) : (
        <Button
          className="h-10"
          onClick={async () => {
            const res = await setCompanyStatus(companyId, "active");
            if (!res.ok) toast.error(res.error);
            else router.refresh();
          }}
        >
          <Play /> {t("platform.companies.activate")}
        </Button>
      )}
    </>
  );
}

export function InviteAdminButton({ companyId, defaults }: { companyId: string; defaults: { full_name: string; email: string; phone: string } }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await inviteCompanyAdmin(companyId, v);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("platform.companies.invited"));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <UserPlus /> {t("platform.companies.invite_admin")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platform.companies.invite_admin")}</DialogTitle>
            <DialogDescription>{t("platform.companies.invite_admin_description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="ia-name">{t("settings.users.name")}</FieldLabel>
              <Input id="ia-name" required className="h-10" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ia-email">{t("settings.users.email")}</FieldLabel>
              <Input id="ia-email" type="email" required className="h-10" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ia-phone">{t("settings.users.phone")}</FieldLabel>
              <Input id="ia-phone" type="tel" className="h-10" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {t("platform.companies.invite_admin")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
