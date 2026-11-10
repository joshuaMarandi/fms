"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable } from "@/components/patterns/data-table";
import { StatusChip } from "@/components/patterns/status-chip";
import { SearchSelect } from "@/components/patterns/search-select";
import { inviteUser, setAdminCeiling, setUserActive, setUserRoles, updateUserProfile } from "./actions";
import { hasKey, t } from "@/i18n";

export type RoleOption = { id: string; name: string; is_system: boolean; is_owner: boolean; is_admin: boolean; company_id: string | null };
export type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  is_active: boolean;
  driver_id: string | null;
  primary_role_id: string | null;
  primary_role: string;
  extra_role_ids: string[];
  is_admin: boolean;
  ceiling: string[];
};

export function UsersClient({ rows, roles, modules, drivers, canEdit, canInvite, isOwner, openInvite }: { rows: UserRow[]; roles: RoleOption[]; modules: { key: string; name: string }[]; drivers: { id: string; full_name: string }[]; canEdit: boolean; canInvite: boolean; isOwner: boolean; openInvite: boolean }) {
  const router = useRouter();
  const [invite, setInvite] = React.useState(openInvite);
  const [selected, setSelected] = React.useState<UserRow | null>(null);

  const columns = React.useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      { id: "full_name", header: t("settings.users.name"), accessorKey: "full_name", cell: ({ row }) => <span className="font-medium">{row.original.full_name}</span> },
      { id: "email", header: t("settings.users.email"), accessorKey: "email" },
      { id: "phone", header: t("settings.users.phone"), accessorKey: "phone" },
      { id: "primary_role", header: t("settings.users.role"), accessorKey: "primary_role", cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          <Badge>{row.original.primary_role || t("common.none")}</Badge>
          {row.original.extra_role_ids.map((id) => (
            <Badge key={id} variant="secondary">
              {roles.find((r) => r.id === id)?.name}
            </Badge>
          ))}
        </span>
      ) },
      { id: "department", header: t("settings.users.department"), accessorKey: "department" },
      { id: "status", header: t("settings.users.status"), accessorFn: (r) => (r.is_active ? "active" : "inactive"), cell: ({ row }) => <StatusChip status={row.original.is_active ? "active" : "inactive"} /> },
    ],
    [roles],
  );

  return (
    <>
      <DataTable<UserRow>
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchKeys={["full_name", "email", "phone", "primary_role", "department"]}
        statusColumn="status"
        statusOptions={["active", "inactive"]}
        rowHref={undefined}
        rowActions={canEdit ? [{ label: t("common.edit"), onSelect: (r) => setSelected(r) }] : undefined}
        toolbar={
          canInvite ? (
            <Button className="h-10" onClick={() => setInvite(true)}>
              <UserPlus /> {t("settings.users.invite")}
            </Button>
          ) : null
        }
        exportName="users"
        canExport={isOwner}
      />

      <InviteDialog open={invite} onOpenChange={setInvite} roles={roles} />
      {selected ? <EditUserSheet user={selected} roles={roles} modules={modules} drivers={drivers} isOwner={isOwner} onClose={() => { setSelected(null); router.refresh(); }} /> : null}
    </>
  );
}

function InviteDialog({ open, onOpenChange, roles }: { open: boolean; onOpenChange: (o: boolean) => void; roles: RoleOption[] }) {
  const router = useRouter();
  const [v, setV] = React.useState({ email: "", full_name: "", phone: "", role_id: roles.find((r) => r.name === "Driver")?.id ?? roles[0]?.id ?? "", job_title: "", department: "" });
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await inviteUser(v);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("settings.users.invited"));
      onOpenChange(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.users.invite")}</DialogTitle>
          <DialogDescription>{t("settings.users.invite_description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="inv-name">{t("settings.users.name")}</FieldLabel>
            <Input id="inv-name" required value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} className="h-10" />
          </Field>
          <Field>
            <FieldLabel htmlFor="inv-email">{t("settings.users.email")}</FieldLabel>
            <Input id="inv-email" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} className="h-10" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="inv-phone">{t("settings.users.phone")}</FieldLabel>
              <Input id="inv-phone" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className="h-10" />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-role">{t("settings.users.role")}</FieldLabel>
              <Select value={v.role_id} onValueChange={(x) => setV({ ...v, role_id: x ?? "" })}>
                <SelectTrigger id="inv-role" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.filter((r) => !r.is_owner).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-job">{t("settings.users.job_title")}</FieldLabel>
              <Input id="inv-job" value={v.job_title} onChange={(e) => setV({ ...v, job_title: e.target.value })} className="h-10" />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-dept">{t("settings.users.department")}</FieldLabel>
              <Input id="inv-dept" value={v.department} onChange={(e) => setV({ ...v, department: e.target.value })} className="h-10" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("settings.users.invite")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserSheet({ user, roles, modules, drivers, isOwner, onClose }: { user: UserRow; roles: RoleOption[]; modules: { key: string; name: string }[]; drivers: { id: string; full_name: string }[]; isOwner: boolean; onClose: () => void }) {
  const [primary, setPrimary] = React.useState(user.primary_role_id ?? "");
  const [extra, setExtra] = React.useState<string[]>(user.extra_role_ids);
  const [active, setActive] = React.useState(user.is_active);
  const [profile, setProfile] = React.useState({ job_title: user.job_title ?? "", department: user.department ?? "", driver_id: user.driver_id ?? "", phone: user.phone ?? "" });
  const [ceiling, setCeiling] = React.useState<string[]>(user.ceiling);
  const [busy, setBusy] = React.useState(false);

  const primaryIsAdmin = roles.find((r) => r.id === primary)?.is_admin || extra.some((id) => roles.find((r) => r.id === id)?.is_admin);
  const label = (key: string, name: string) => (hasKey(`resource.${key}`) ? t(`resource.${key}`) : name);

  async function save() {
    setBusy(true);
    const results = await Promise.all([
      setUserRoles(user.id, primary, extra),
      setUserActive(user.id, active),
      updateUserProfile(user.id, { job_title: profile.job_title || null, department: profile.department || null, driver_id: profile.driver_id || null, phone: profile.phone || null }),
      isOwner && primaryIsAdmin ? setAdminCeiling(user.id, ceiling) : Promise.resolve({ ok: true as const, data: null }),
    ]);
    setBusy(false);
    const failed = results.find((r) => !r.ok) as { ok: false; error: string } | undefined;
    if (failed) toast.error(failed.error);
    else {
      toast.success(t("settings.users.roles_saved"));
      onClose();
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{user.full_name}</SheetTitle>
          <SheetDescription>{user.email}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <Field orientation="horizontal" className="rounded-lg border px-3 py-2">
            <FieldLabel htmlFor="u-active" className="flex-1">
              {active ? t("status.active") : t("status.inactive")}
            </FieldLabel>
            <Switch id="u-active" checked={active} onCheckedChange={setActive} />
          </Field>
          <Field>
            <FieldLabel htmlFor="u-primary">{t("settings.users.role")}</FieldLabel>
            <Select value={primary} onValueChange={(v) => setPrimary(v ?? "")}>
              <SelectTrigger id="u-primary" className="h-10 w-full">
                <SelectValue placeholder={t("common.select_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {roles.filter((r) => isOwner || (!r.is_owner && !r.is_admin)).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t("settings.users.extra_roles")}</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles
                .filter((r) => r.id !== primary && (isOwner || (!r.is_owner && !r.is_admin)))
                .map((r) => (
                  <label key={r.id} className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm">
                    <Checkbox checked={extra.includes(r.id)} onCheckedChange={(c) => setExtra(c ? [...extra, r.id] : extra.filter((x) => x !== r.id))} />
                    {r.name}
                  </label>
                ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="u-job">{t("settings.users.job_title")}</FieldLabel>
              <Input id="u-job" value={profile.job_title} onChange={(e) => setProfile({ ...profile, job_title: e.target.value })} className="h-10" />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-dept">{t("settings.users.department")}</FieldLabel>
              <Input id="u-dept" value={profile.department} onChange={(e) => setProfile({ ...profile, department: e.target.value })} className="h-10" />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-phone">{t("settings.users.phone")}</FieldLabel>
              <Input id="u-phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="h-10" />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-driver">{t("settings.users.link_driver")}</FieldLabel>
              <SearchSelect id="u-driver" value={profile.driver_id} onChange={(v) => setProfile({ ...profile, driver_id: v })} options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} placeholder={t("common.none")} />
            </Field>
          </div>
          {isOwner && primaryIsAdmin ? (
            <Field>
              <FieldLabel>{t("settings.users.ceiling")}</FieldLabel>
              <FieldDescription>{t("settings.users.ceiling_description")}</FieldDescription>
              <div className="grid gap-2 sm:grid-cols-2">
                {modules.map((m) => (
                  <label key={m.key} className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm">
                    <Checkbox checked={ceiling.includes(m.key)} onCheckedChange={(c) => setCeiling(c ? [...ceiling, m.key] : ceiling.filter((x) => x !== m.key))} />
                    {label(m.key, m.name)}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save} disabled={busy || !primary}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
