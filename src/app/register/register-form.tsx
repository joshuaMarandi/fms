"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/i18n";

type Pkg = { id: string; name: string; max_vehicles: number; price: number; currency: string; billing_period: string };

export function RegisterForm({ packages, selected }: { packages: Pkg[]; selected: string }) {
  const [v, setV] = React.useState({ company_name: "", contact_name: "", email: "", phone: "", city: "", country: "Tanzania", vehicles_count: "", package_id: selected, message: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (v.company_name.trim().length < 2) errs.company_name = t("form.required");
    if (v.contact_name.trim().length < 2) errs.contact_name = t("form.required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) errs.email = t("form.invalid_email");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFailure(null);
    const supabase = createClient();
    const { error } = await supabase.from("company_registrations").insert({
      company_name: v.company_name.trim(),
      contact_name: v.contact_name.trim(),
      email: v.email.trim().toLowerCase(),
      phone: v.phone.trim() || null,
      city: v.city.trim() || null,
      country: v.country.trim() || null,
      vehicles_count: v.vehicles_count === "" ? null : Number(v.vehicles_count),
      package_id: v.package_id || null,
      message: v.message.trim() || null,
    });
    setBusy(false);
    if (error) {
      setFailure(t("register.error"));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{t("register.done_title")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t("register.done_body", { email: v.email })}</p>
      </div>
    );
  }

  const text = (k: keyof typeof v, label: string, opts: { type?: string; required?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; autoComplete?: string } = {}) => (
    <Field data-invalid={!!errors[k]}>
      <FieldLabel htmlFor={`r-${k}`}>
        {t(label)}
        {opts.required ? <span className="text-danger"> *</span> : null}
      </FieldLabel>
      <Input id={`r-${k}`} type={opts.type ?? "text"} inputMode={opts.inputMode} autoComplete={opts.autoComplete} className="h-10" value={v[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k]} />
      {errors[k] ? <FieldError>{errors[k]}</FieldError> : null}
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {failure ? (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {text("company_name", "register.company_name", { required: true, autoComplete: "organization" })}
        {text("contact_name", "register.contact_name", { required: true, autoComplete: "name" })}
        {text("email", "register.email", { type: "email", required: true, inputMode: "email", autoComplete: "email" })}
        {text("phone", "register.phone", { type: "tel", inputMode: "tel", autoComplete: "tel" })}
        {text("city", "register.city", { autoComplete: "address-level2" })}
        {text("country", "register.country", { autoComplete: "country-name" })}
        {text("vehicles_count", "register.vehicles_count", { type: "number", inputMode: "numeric" })}
        <Field>
          <FieldLabel htmlFor="r-package">{t("register.package")}</FieldLabel>
          <Select value={v.package_id} onValueChange={(x) => set("package_id", x ?? "")}>
            <SelectTrigger id="r-package" className="h-10 w-full">
              <SelectValue placeholder={t("common.select_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {packages.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.currency} {p.price.toLocaleString("en")} · {t("platform.packages.vehicles_up_to", { count: p.max_vehicles })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="r-message">{t("register.message")}</FieldLabel>
          <Textarea id="r-message" rows={3} maxLength={2000} value={v.message} onChange={(e) => set("message", e.target.value)} />
        </Field>
      </div>
      <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
        {busy ? t("register.sending") : t("register.submit")}
      </Button>
    </form>
  );
}
