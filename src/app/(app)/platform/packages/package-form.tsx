"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { buildResourceTree, type Resource, type ResourceNode } from "@/lib/permissions";
import { deletePackage, savePackage, type PackageInput } from "../actions";
import { cn } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

const CURRENCIES = ["TZS", "USD", "KES", "UGX"];
const label = (r: Resource) => (hasKey(`resource.${r.key}`) ? t(`resource.${r.key}`) : r.name);

/** Every descendant key of a node. */
function descendants(n: ResourceNode): string[] {
  return n.children.flatMap((c) => [c.key, ...descendants(c)]);
}

export function PackageForm({ pkg, resources, companiesUsing }: { pkg: PackageInput | null; resources: Resource[]; companiesUsing: number }) {
  const router = useRouter();
  const tree = React.useMemo(() => buildResourceTree(resources.filter((r) => !["dashboard", "settings", "platform"].includes(r.key.split(".")[0]!))), [resources]);
  const nodes = React.useMemo(() => {
    const m = new Map<string, ResourceNode>();
    const walk = (ns: ResourceNode[]) => ns.forEach((n) => { m.set(n.key, n); walk(n.children); });
    walk(tree);
    return m;
  }, [tree]);

  // Expand the saved (minimal) keys to every covered node; parents count as selected when all children are.
  const expand = React.useCallback(
    (keys: string[]) => {
      const set = new Set<string>();
      for (const k of keys) {
        const n = nodes.get(k);
        if (!n) continue;
        set.add(k);
        descendants(n).forEach((d) => set.add(d));
      }
      return set;
    },
    [nodes],
  );

  const [v, setV] = React.useState<Omit<PackageInput, "resource_keys">>(
    pkg ?? { name: "", description: "", price: 0, currency: "TZS", billing_period: "monthly", max_vehicles: 10, is_active: true, is_public: true, sort_order: 0 },
  );
  const [selected, setSelected] = React.useState<Set<string>>(() => expand(pkg?.resource_keys ?? []));
  const [busy, setBusy] = React.useState(false);

  const parentOf = (key: string) => nodes.get(key)?.parent_key ?? null;

  function toggle(n: ResourceNode, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const keys = [n.key, ...descendants(n)];
      if (on) keys.forEach((k) => next.add(k));
      else keys.forEach((k) => next.delete(k));
      // Walk up: a parent is selected only when all its children are.
      let p = parentOf(n.key);
      while (p) {
        const pn = nodes.get(p);
        if (!pn) break;
        if (pn.children.every((c) => next.has(c.key))) next.add(p);
        else next.delete(p);
        p = pn.parent_key;
      }
      return next;
    });
  }

  /** Minimal keys: a selected node whose parent is not selected. */
  function minimalKeys() {
    return Array.from(selected).filter((k) => {
      const p = parentOf(k);
      return !p || !selected.has(p);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const keys = minimalKeys();
    if (!v.name.trim() || v.max_vehicles < 1) {
      toast.error(t("form.fix_errors"));
      return;
    }
    if (keys.length === 0) {
      toast.error(t("platform.packages.no_modules"));
      return;
    }
    setBusy(true);
    const res = await savePackage({ ...v, id: pkg?.id ?? null, resource_keys: keys });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("platform.packages.saved"));
    router.push("/platform/packages");
    router.refresh();
  }

  const state = (n: ResourceNode): boolean | "indeterminate" => {
    if (selected.has(n.key)) return true;
    return descendants(n).some((d) => selected.has(d)) ? "indeterminate" : false;
  };

  const renderNodes = (ns: ResourceNode[], depth: number): React.ReactNode =>
    ns.map((n) => (
      <li key={n.key}>
        <label className={cn("flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50", depth === 0 && "font-medium")} style={{ paddingLeft: 8 + depth * 20 }}>
          <Checkbox checked={state(n)} onCheckedChange={(c) => toggle(n, c === true)} />
          <span>
            {n.label_prefix && /^\d+$/.test(n.label_prefix) ? <span className="mr-1 text-muted-foreground">{n.label_prefix}</span> : null}
            {label(n)}
          </span>
        </label>
        {n.children.length ? <ul>{renderNodes(n.children, depth + 1)}</ul> : null}
      </li>
    ));

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <section className="page-card space-y-4 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="p-name">
              {t("platform.packages.name")} <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="p-name" required className="h-10" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="p-desc">{t("platform.packages.package_description")}</FieldLabel>
            <Textarea id="p-desc" rows={2} value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-price">
              {t("platform.packages.price")} <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="p-price" type="number" inputMode="decimal" min={0} required className="h-10" value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-currency">{t("platform.packages.currency")}</FieldLabel>
            <Select value={v.currency} onValueChange={(x) => setV({ ...v, currency: x ?? "TZS" })}>
              <SelectTrigger id="p-currency" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="p-period">{t("platform.packages.billing_period")}</FieldLabel>
            <Select value={v.billing_period} onValueChange={(x) => setV({ ...v, billing_period: (x as PackageInput["billing_period"]) ?? "monthly" })}>
              <SelectTrigger id="p-period" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["monthly", "quarterly", "yearly"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`platform.packages.period_label.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="p-max">
              {t("platform.packages.max_vehicles")} <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="p-max" type="number" inputMode="numeric" min={1} required className="h-10" value={v.max_vehicles} onChange={(e) => setV({ ...v, max_vehicles: Number(e.target.value) })} />
            <FieldDescription>{t("platform.packages.max_vehicles_hint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="p-order">{t("platform.packages.sort_order")}</FieldLabel>
            <Input id="p-order" type="number" inputMode="numeric" className="h-10" value={v.sort_order} onChange={(e) => setV({ ...v, sort_order: Number(e.target.value) })} />
          </Field>
          <Field orientation="horizontal" className="rounded-lg border px-3 py-2">
            <FieldLabel htmlFor="p-active" className="flex-1">
              {t("platform.packages.active")}
              <span className="block text-xs font-normal text-muted-foreground">{t("platform.packages.active_hint")}</span>
            </FieldLabel>
            <Switch id="p-active" checked={v.is_active} onCheckedChange={(c) => setV({ ...v, is_active: c })} />
          </Field>
          <Field orientation="horizontal" className="rounded-lg border px-3 py-2">
            <FieldLabel htmlFor="p-public" className="flex-1">
              {t("platform.packages.public")}
            </FieldLabel>
            <Switch id="p-public" checked={v.is_public} onCheckedChange={(c) => setV({ ...v, is_public: c })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {pkg?.id ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" className="text-danger" disabled={companiesUsing > 0} title={companiesUsing > 0 ? t("platform.packages.delete_blocked") : undefined}>
                  <Trash2 /> {t("common.delete")}
                </Button>
              }
              description={t("common.confirm_delete")}
              destructive
              confirmLabel={t("common.delete")}
              onConfirm={async () => {
                const res = await deletePackage(pkg.id!);
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success(t("platform.packages.deleted"));
                  router.push("/platform/packages");
                  router.refresh();
                }
              }}
            />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => router.push("/platform/packages")}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </section>

      <section className="page-card p-4 md:p-6">
        <h2 className="text-base font-semibold">{t("platform.packages.modules")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("platform.packages.modules_hint")}</p>
        <ul className="max-h-[70vh] overflow-y-auto">{renderNodes(tree, 0)}</ul>
      </section>
    </form>
  );
}
