"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/patterns/date-picker";
import { saveCompany, type CompanyInput } from "../actions";
import { daysFromNowISO, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

export type PackageOption = { id: string; name: string; max_vehicles: number; price: number; currency: string; billing_period: string; is_active: boolean };

const STATUSES: CompanyInput["status"][] = ["active", "trial", "pending", "suspended", "cancelled"];

export function CompanyForm({ company, packages }: { company: CompanyInput | null; packages: PackageOption[] }) {
  const router = useRouter();
  const [v, setV] = React.useState<CompanyInput>(() =>
    company ?? {
      name: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      address: "",
      city: "",
      country: "Tanzania",
      package_id: packages.find((p) => p.is_active)?.id ?? null,
      status: "trial",
      subscription_start: todayISO(),
      subscription_end: daysFromNowISO(30),
      notes: "",
    },
  );
  const [busy, setBusy] = React.useState(false);
  const set = (patch: Partial<CompanyInput>) => setV((x) => ({ ...x, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) {
      toast.error(t("form.fix_errors"));
      return;
    }
    setBusy(true);
    const res = await saveCompany(v);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("platform.companies.saved"));
    if (!company?.id) router.push(`/platform/companies/${res.data.id}`);
    router.refresh();
  }

  const text = (key: keyof CompanyInput, label: string, type = "text") => (
    <Field>
      <FieldLabel htmlFor={`c-${key}`}>{t(label)}</FieldLabel>
      <Input id={`c-${key}`} type={type} className="h-10" value={(v[key] as string) ?? ""} onChange={(e) => set({ [key]: e.target.value } as Partial<CompanyInput>)} />
    </Field>
  );

  const selected = packages.find((p) => p.id === v.package_id);

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="page-card p-4 md:p-6">
        <h2 className="mb-4 text-base font-semibold">{t("platform.companies.details")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="c-name">
              {t("platform.companies.name")} <span className="text-danger">*</span>
            </FieldLabel>
            <Input id="c-name" required className="h-10" value={v.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          {text("contact_name", "platform.companies.contact_name")}
          {text("contact_email", "platform.companies.contact_email", "email")}
          {text("contact_phone", "platform.companies.contact_phone", "tel")}
          {text("address", "platform.companies.address")}
          {text("city", "platform.companies.city")}
          {text("country", "platform.companies.country")}
        </div>
      </section>

      <section className="page-card p-4 md:p-6">
        <h2 className="mb-4 text-base font-semibold">{t("platform.companies.subscription")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="c-package">{t("platform.companies.package")}</FieldLabel>
            <Select value={v.package_id ?? "none"} onValueChange={(x) => set({ package_id: x === "none" ? null : (x ?? null) })}>
              <SelectTrigger id="c-package" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("platform.companies.no_package")}</SelectItem>
                {packages
                  .filter((p) => p.is_active || p.id === v.package_id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.currency} {p.price.toLocaleString("en")} {t(`platform.packages.period.${p.billing_period}`)} · {t("platform.packages.vehicles_up_to", { count: p.max_vehicles })}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selected ? <FieldDescription>{t("platform.packages.vehicles_up_to", { count: selected.max_vehicles })}</FieldDescription> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="c-status">{t("platform.companies.status")}</FieldLabel>
            <Select value={v.status} onValueChange={(x) => set({ status: (x as CompanyInput["status"]) ?? "active" })}>
              <SelectTrigger id="c-status" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`platform.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="c-start">{t("platform.companies.subscription_start")}</FieldLabel>
            <DatePicker id="c-start" value={v.subscription_start} onChange={(d) => set({ subscription_start: d })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-end">{t("platform.companies.subscription_end")}</FieldLabel>
            <DatePicker id="c-end" value={v.subscription_end} onChange={(d) => set({ subscription_end: d })} />
            <FieldDescription>{t("platform.companies.subscription_end_hint")}</FieldDescription>
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="c-notes">{t("platform.companies.notes")}</FieldLabel>
            <Textarea id="c-notes" rows={3} value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" onClick={() => router.push("/platform/companies")}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
