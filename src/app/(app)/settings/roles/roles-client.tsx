"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { ACTIONS, buildResourceTree, describeGrant, permissionScope, SCOPES, type Grant, type GrantScope, type PermissionAction, type Resource, type ResourceNode } from "@/lib/permissions";
import { createRole, deleteRole, renameRole, saveRoleGrants } from "./actions";
import { cn } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

export type RoleRow = { id: string; name: string; description: string | null; is_system: boolean; is_owner: boolean; is_admin: boolean; company_id: string | null; user_count: number };

type Cell = { actions: Set<PermissionAction>; scope: GrantScope };
type Matrix = Map<string, Cell>;

const label = (r: Resource) => (hasKey(`resource.${r.key}`) ? t(`resource.${r.key}`) : r.name);

export function RolesClient({ roles, grants, resources, isOwner, canEdit, canCreate, ceiling, myGrants, openAdd }: { roles: RoleRow[]; grants: Grant[]; resources: Resource[]; isOwner: boolean; canEdit: boolean; canCreate: boolean; ceiling: string[]; myGrants: Grant[]; openAdd: boolean }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState(roles[0]?.id ?? "");
  const [adding, setAdding] = React.useState(openAdd);
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];

  const tree = React.useMemo(() => buildResourceTree(resources), [resources]);

  // Admin ceiling: rows outside the ceiling are hidden; actions the admin does not hold are disabled.
  const myCtx = React.useMemo(() => ({ isOwner, isAdmin: !isOwner, grants: myGrants, resources }), [isOwner, myGrants, resources]);
  const inCeiling = (key: string) => isOwner || ceiling.some((c) => c === key || key.startsWith(c + "."));
  const visibleTree = React.useMemo(() => (isOwner ? tree : filterCeiling(tree, inCeiling)), [tree, isOwner, ceiling]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = canEdit && selected && !selected.is_owner && (isOwner || !selected.is_system);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="page-card overflow-hidden">
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-medium">{t("settings.roles.title")}</p>
          {canCreate ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus /> {t("settings.roles.add")}
            </Button>
          ) : null}
        </div>
        <ul className="max-h-[70vh] overflow-y-auto">
          {roles.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setSelectedId(r.id)} className={cn("flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50", selected?.id === r.id && "bg-primary/5 font-medium")} aria-current={selected?.id === r.id}>
                <span className="min-w-0">
                  <span className="block truncate">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{t("settings.roles.users_with_role", { count: r.user_count })}</span>
                </span>
                {r.is_owner ? <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label={t("settings.roles.system")} /> : r.is_system ? <Badge variant="secondary" className="text-[10px]">{t("settings.roles.system")}</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {selected ? (
        <RoleEditor
          key={selected.id}
          role={selected}
          grants={grants.filter((g) => g.role_id === selected.id)}
          resources={resources}
          tree={visibleTree}
          editable={!!editable}
          isOwner={isOwner}
          canDelete={!!editable && selected.user_count === 0 && !selected.is_system}
          holdsAction={(key, action) => (isOwner ? true : permissionScope(myCtx, key, action) !== null)}
          maxScope={(key, action) => (isOwner ? "all" : permissionScope(myCtx, key, action))}
          onDeleted={() => { setSelectedId(roles.find((r) => r.id !== selected.id)?.id ?? ""); router.refresh(); }}
        />
      ) : null}

      <AddRoleDialog open={adding} onOpenChange={setAdding} roles={roles} onCreated={(id) => { setSelectedId(id); router.refresh(); }} />
    </div>
  );
}

function filterCeiling(nodes: ResourceNode[], inCeiling: (k: string) => boolean): ResourceNode[] {
  const out: ResourceNode[] = [];
  for (const n of nodes) {
    const children = filterCeiling(n.children, inCeiling);
    if (inCeiling(n.key) || children.length) out.push({ ...n, children: inCeiling(n.key) ? n.children : children });
  }
  return out;
}

function RoleEditor({ role, grants, resources, tree, editable, isOwner, canDelete, holdsAction, maxScope, onDeleted }: {
  role: RoleRow;
  grants: Grant[];
  resources: Resource[];
  tree: ResourceNode[];
  editable: boolean;
  isOwner: boolean;
  canDelete: boolean;
  holdsAction: (key: string, action: PermissionAction) => boolean;
  maxScope: (key: string, action: PermissionAction) => GrantScope | null;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const initial = React.useMemo<Matrix>(() => new Map(grants.map((g) => [g.resource_key, { actions: new Set(g.actions), scope: g.scope }])), [grants]);
  const [matrix, setMatrix] = React.useState<Matrix>(initial);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(role.name);
  const [description, setDescription] = React.useState(role.description ?? "");
  const dirty = React.useMemo(() => serialize(matrix) !== serialize(initial), [matrix, initial]);

  const cell = (key: string): Cell => matrix.get(key) ?? { actions: new Set(), scope: "all" };

  function toggle(key: string, action: PermissionAction, on: boolean) {
    setMatrix((m) => {
      const next = new Map(m);
      const c = { actions: new Set(cell(key).actions), scope: cell(key).scope };
      if (on) c.actions.add(action);
      else c.actions.delete(action);
      if (c.actions.size === 0) next.delete(key);
      else next.set(key, c);
      return next;
    });
  }
  function setRowAll(key: string, on: boolean) {
    setMatrix((m) => {
      const next = new Map(m);
      if (!on) next.delete(key);
      else next.set(key, { actions: new Set(ACTIONS.filter((a) => holdsAction(key, a))), scope: cell(key).scope });
      return next;
    });
  }
  function setColumnAll(action: PermissionAction, on: boolean) {
    setMatrix((m) => {
      const next = new Map(m);
      const walk = (nodes: ResourceNode[]) => {
        for (const n of nodes) {
          if (holdsAction(n.key, action)) {
            const c = next.get(n.key) ?? { actions: new Set<PermissionAction>(), scope: "all" as GrantScope };
            const actions = new Set(c.actions);
            if (on) actions.add(action);
            else actions.delete(action);
            if (actions.size === 0) next.delete(n.key);
            else next.set(n.key, { actions, scope: c.scope });
          }
          walk(n.children);
        }
      };
      walk(tree);
      return next;
    });
  }
  function setScope(key: string, scope: GrantScope) {
    setMatrix((m) => {
      const next = new Map(m);
      const c = cell(key);
      next.set(key, { actions: new Set(c.actions.size ? c.actions : ["view"]), scope });
      return next;
    });
  }

  async function save() {
    setBusy(true);
    const payload = Array.from(matrix.entries()).map(([resource_key, c]) => ({ resource_key, actions: Array.from(c.actions), scope: c.scope }));
    const res = await saveRoleGrants(role.id, payload);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("settings.roles.saved"));
      router.refresh();
    }
  }

  async function doRename() {
    const res = await renameRole(role.id, name.trim(), description.trim() || null);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("common.saved"));
      setRenaming(false);
      router.refresh();
    }
  }

  const inherited = (key: string): { from: string; cell: Cell } | null => {
    let parent = resources.find((r) => r.key === key)?.parent_key ?? null;
    while (parent) {
      const c = matrix.get(parent);
      if (c) return { from: parent, cell: c };
      parent = resources.find((r) => r.key === parent)?.parent_key ?? null;
    }
    return null;
  };

  const renderRows = (nodes: ResourceNode[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      const c = matrix.get(n.key);
      const inh = !c ? inherited(n.key) : null;
      const isCollapsed = collapsed.has(n.key);
      const rowAll = ACTIONS.filter((a) => holdsAction(n.key, a)).every((a) => c?.actions.has(a));
      return (
        <React.Fragment key={n.key}>
          <tr className={cn("border-t", depth === 0 && "bg-muted/30")}>
            <td className="py-1.5 pr-2 pl-2 whitespace-nowrap" style={{ paddingLeft: 8 + depth * 18 }}>
              <span className="flex items-center gap-1">
                {n.children.length ? (
                  <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => setCollapsed((s) => { const x = new Set(s); if (x.has(n.key)) x.delete(n.key); else x.add(n.key); return x; })} aria-label={isCollapsed ? t("common.show_more") : t("common.show_less")} aria-expanded={!isCollapsed}>
                    {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                ) : (
                  <span className="inline-block w-5" />
                )}
                <Checkbox checked={rowAll && !!c} disabled={!editable} onCheckedChange={(v) => setRowAll(n.key, !!v)} aria-label={`${t("settings.roles.row_all")}: ${label(n)}`} />
                <span className={cn("text-sm", depth === 0 && "font-medium")}>
                  {label(n)}
                </span>
                {inh ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="ml-1 text-[10px] text-muted-foreground">{t("settings.roles.inherits", { from: label(resources.find((r) => r.key === inh.from)!) })}</span>
                    </TooltipTrigger>
                    <TooltipContent>{Array.from(inh.cell.actions).join(", ")}</TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
            </td>
            {ACTIONS.map((a) => {
              const holds = holdsAction(n.key, a);
              const checked = c?.actions.has(a) ?? false;
              const inhChecked = !c && inh?.cell.actions.has(a);
              return (
                <td key={a} className="px-1 py-1.5 text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Checkbox checked={checked} disabled={!editable || !holds} onCheckedChange={(v) => toggle(n.key, a, !!v)} aria-label={`${t(`action.${a}`)}: ${label(n)}`} className={cn(inhChecked && "opacity-40")} />
                      </span>
                    </TooltipTrigger>
                    {!holds ? <TooltipContent>{t("settings.roles.not_held")}</TooltipContent> : inhChecked ? <TooltipContent>{t("settings.roles.inherits", { from: label(resources.find((r) => r.key === inh!.from)!) })}</TooltipContent> : null}
                  </Tooltip>
                </td>
              );
            })}
            <td className="px-1 py-1.5">
              <Select value={(c ?? inh?.cell)?.scope ?? "all"} onValueChange={(v) => setScope(n.key, v as GrantScope)} disabled={!editable}>
                <SelectTrigger className="h-8 w-[130px] text-xs" aria-label={`${t("settings.roles.scope")}: ${label(n)}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.filter((s) => {
                    const m = ACTIONS.filter((a) => (c?.actions.has(a) ?? false)).map((a) => maxScope(n.key, a));
                    const widest = m.length ? m.reduce((acc, x) => (rank(x) > rank(acc) ? x : acc), "own" as GrantScope | null) : "all";
                    return isOwner || rank(s) <= rank(widest);
                  }).map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`scope.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </td>
          </tr>
          {!isCollapsed ? renderRows(n.children, depth + 1) : null}
        </React.Fragment>
      );
    });

  const sentences = Array.from(matrix.entries()).map(([key, c]) => {
    const r = resources.find((x) => x.key === key);
    return r ? describeGrant(role.name, label(r), Array.from(c.actions), c.scope) : null;
  });

  return (
    <section className="space-y-4">
      <div className="page-card flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          {renaming ? (
            <div className="space-y-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" aria-label={t("settings.roles.name")} />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} aria-label={t("settings.roles.role_description")} />
              <div className="flex gap-2">
                <Button size="sm" onClick={doRename}>{t("common.save")}</Button>
                <Button size="sm" variant="outline" onClick={() => setRenaming(false)}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {role.name}
                {role.is_owner ? <Lock className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
                <Badge variant="secondary">{role.is_system ? t("settings.roles.system") : t("settings.roles.custom")}</Badge>
              </h2>
              {role.description ? <p className="text-sm text-muted-foreground">{role.description}</p> : null}
              <p className="text-xs text-muted-foreground">{t("settings.roles.users_with_role", { count: role.user_count })}</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {editable && !renaming ? (
            <Button variant="outline" size="sm" onClick={() => setRenaming(true)}>
              <Pencil /> {t("settings.roles.rename")}
            </Button>
          ) : null}
          {canDelete ? (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm" className="text-danger">
                  <Trash2 /> {t("settings.roles.delete")}
                </Button>
              }
              description={t("common.confirm_delete")}
              destructive
              confirmLabel={t("common.delete")}
              onConfirm={async () => {
                const res = await deleteRole(role.id);
                if (!res.ok) toast.error(res.hint === "role_in_use" ? t("settings.roles.delete_blocked") : res.error);
                else {
                  toast.success(t("settings.roles.deleted"));
                  onDeleted();
                }
              }}
            />
          ) : null}
          {editable ? (
            <Button size="sm" onClick={save} disabled={busy || !dirty}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          ) : null}
        </div>
      </div>

      {role.is_owner ? (
        <p className="rounded-lg bg-muted p-3 text-sm">{t("settings.roles.owner_locked")}</p>
      ) : (
        <div className="page-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">{t("settings.roles.matrix")}</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-1 py-2 text-center font-medium">
                    <span className="flex flex-col items-center gap-1">
                      {t(`action.${a}`)}
                      <Checkbox disabled={!editable} onCheckedChange={(v) => setColumnAll(a, !!v)} aria-label={`${t("settings.roles.column_all")}: ${t(`action.${a}`)}`} />
                    </span>
                  </th>
                ))}
                <th className="px-1 py-2 text-left font-medium">{t("settings.roles.scope")}</th>
              </tr>
            </thead>
            <tbody>{renderRows(tree, 0)}</tbody>
          </table>
        </div>
      )}

      {!role.is_owner ? (
        <div className="page-card p-4">
          <h3 className="mb-2 text-sm font-semibold">{t("settings.roles.preview")}</h3>
          {sentences.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("common.none")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {sentences.map((s, i) => (s ? <li key={i}>{s}</li> : null))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function rank(s: GrantScope | null) {
  return s === "all" ? 3 : s === "department" ? 2 : s === "own" ? 1 : 0;
}

function serialize(m: Matrix) {
  return JSON.stringify(Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, c]) => [k, Array.from(c.actions).sort(), c.scope]));
}

function AddRoleDialog({ open, onOpenChange, roles, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; roles: RoleRow[]; onCreated: (id: string) => void }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [copyFrom, setCopyFrom] = React.useState<string>("none");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createRole({ name: name.trim(), description: description.trim() || undefined, copy_from: copyFrom === "none" ? null : copyFrom });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("settings.roles.created"));
      onOpenChange(false);
      setName("");
      setDescription("");
      onCreated(res.data.id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.roles.add")}</DialogTitle>
          <DialogDescription>{t("settings.roles.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="role-name">{t("settings.roles.name")}</FieldLabel>
            <Input id="role-name" required value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          </Field>
          <Field>
            <FieldLabel htmlFor="role-desc">{t("settings.roles.role_description")}</FieldLabel>
            <Textarea id="role-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="role-copy">{t("settings.roles.copy_from")}</FieldLabel>
            <Select value={copyFrom} onValueChange={(v) => setCopyFrom(v ?? "none")}>
              <SelectTrigger id="role-copy" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none")}</SelectItem>
                {roles.filter((r) => !r.is_owner).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("settings.roles.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
