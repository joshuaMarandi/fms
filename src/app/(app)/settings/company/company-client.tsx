"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoField } from "./logo-field";
import { FormActions } from "@/components/patterns/form-actions";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/permissions/provider";
import { t } from "@/i18n";

type Site = { id: string; name: string; region: string | null };
type Price = { id: string; category: string; price_tzs: number };
type Category = { id: string; name: string; counts_against_balance: boolean };
type Vehicle = { id: string; registration: string; make: string; model: string; target_km_per_l: number | null };

type CompanyDetails = { id: string; name: string; logo_url: string | null; settings: Record<string, unknown>; address: string | null; city: string | null; country: string | null; contact_phone: string | null; contact_email: string | null; tax_number: string | null; website: string | null };

export function CompanyClient({ company, sites, prices, categories, vehicles, canEdit }: { company: CompanyDetails; sites: Site[]; prices: Price[]; categories: Category[]; vehicles: Vehicle[]; canEdit: boolean }) {
  const router = useRouter();
  const session = useSession();
  const supabase = createClient();
  const [name, setName] = React.useState(company.name);
  const [details, setDetails] = React.useState({
    address: company.address ?? "",
    city: company.city ?? "",
    country: company.country ?? "",
    contact_phone: company.contact_phone ?? "",
    contact_email: company.contact_email ?? "",
    tax_number: company.tax_number ?? "",
    website: company.website ?? "",
  });
  // The per-litre price now lives in the Fuel price card; keep the legacy setting unchanged.
  const fuelPrice = String(company.settings.fuel_price_per_litre ?? "");
  const [defaultTarget, setDefaultTarget] = React.useState(String(company.settings.default_target_km_per_l ?? ""));
  const [siteRows, setSiteRows] = React.useState<Site[]>(sites);
  const [priceRows, setPriceRows] = React.useState<Price[]>(() => ["full", "body", "interior", "engine"].map((c) => prices.find((p) => p.category === c) ?? { id: "", category: c, price_tzs: 0 }));
  const [catRows, setCatRows] = React.useState<Category[]>(categories);
  const [vehicleRows, setVehicleRows] = React.useState<Vehicle[]>(vehicles);
  const [busy, setBusy] = React.useState(false);

  async function saveAll() {
    setBusy(true);
    try {
      const { error: e1 } = await supabase
        .from("companies")
        .update({ name, ...Object.fromEntries(Object.entries(details).map(([k, v]) => [k, v.trim() || null])), settings: { ...company.settings, fuel_price_per_litre: fuelPrice === "" ? null : Number(fuelPrice), default_target_km_per_l: defaultTarget === "" ? null : Number(defaultTarget) } })
        .eq("id", company.id);
      if (e1) throw e1;

      for (const s of siteRows) {
        if (!s.name.trim()) continue;
        if (s.id) {
          const { error } = await supabase.from("sites").update({ name: s.name, region: s.region || null }).eq("id", s.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("sites").insert({ company_id: company.id, name: s.name, region: s.region || null });
          if (error) throw error;
        }
      }
      const removedSites = sites.filter((s) => !siteRows.some((r) => r.id === s.id));
      for (const s of removedSites) {
        const { error } = await supabase.from("sites").update({ deleted_at: new Date().toISOString() }).eq("id", s.id);
        if (error) throw error;
      }

      for (const p of priceRows) {
        if (p.id) {
          const { error } = await supabase.from("wash_prices").update({ price_tzs: p.price_tzs }).eq("id", p.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("wash_prices").insert({ company_id: company.id, category: p.category, price_tzs: p.price_tzs });
          if (error) throw error;
        }
      }

      for (const c of catRows) {
        if (!c.name.trim()) continue;
        if (c.id) {
          const { error } = await supabase.from("leave_categories").update({ name: c.name, counts_against_balance: c.counts_against_balance }).eq("id", c.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("leave_categories").insert({ company_id: company.id, name: c.name, counts_against_balance: c.counts_against_balance });
          if (error) throw error;
        }
      }
      const removedCats = categories.filter((c) => !catRows.some((r) => r.id === c.id));
      for (const c of removedCats) {
        const { error } = await supabase.from("leave_categories").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
        if (error) throw error;
      }

      for (const v of vehicleRows) {
        const orig = vehicles.find((x) => x.id === v.id);
        if (orig && orig.target_km_per_l !== v.target_km_per_l) {
          const { error } = await supabase.from("vehicles").update({ target_km_per_l: v.target_km_per_l }).eq("id", v.id);
          if (error) throw error;
        }
      }
      toast.success(t("settings.company.saved"));
      router.refresh();
    } catch (e) {
      toast.error((e as { message?: string }).message ?? t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const ro = !canEdit;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.company.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel htmlFor="c-name">{t("settings.company.name")}</FieldLabel>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} disabled={ro} className="h-10" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">

              <Field>
                <FieldLabel htmlFor="c-target">{t("settings.company.default_target")}</FieldLabel>
                <Input id="c-target" type="number" inputMode="decimal" step="0.1" value={defaultTarget} onChange={(e) => setDefaultTarget(e.target.value)} disabled={ro} className="h-10" />
              </Field>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t("settings.company.logo")}</p>
              <LogoField companyId={company.id} logoUrl={session.brand?.logoUrl ?? null} readOnly={ro} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["address", "settings.company.address", "text"],
                  ["city", "settings.company.city", "text"],
                  ["country", "settings.company.country", "text"],
                  ["contact_phone", "settings.company.phone", "tel"],
                  ["contact_email", "settings.company.email", "email"],
                  ["website", "settings.company.website", "url"],
                  ["tax_number", "settings.company.tax_number", "text"],
                ] as const
              ).map(([key, label, type]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`c-${key}`}>{t(label)}</FieldLabel>
                  <Input id={`c-${key}`} type={type} className="h-10" value={details[key]} disabled={ro} onChange={(e) => setDetails((d) => ({ ...d, [key]: e.target.value }))} />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.company.details_hint")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.company.sites")}</CardTitle>
            <CardDescription>{t("fleet.location")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {siteRows.map((s, i) => (
              <div key={s.id || `new-${i}`} className="flex items-center gap-2">
                <Input value={s.name} onChange={(e) => setSiteRows(siteRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={t("settings.company.site_name")} aria-label={t("settings.company.site_name")} disabled={ro} className="h-10" />
                <Input value={s.region ?? ""} onChange={(e) => setSiteRows(siteRows.map((x, j) => (j === i ? { ...x, region: e.target.value } : x)))} placeholder={t("settings.company.site_region")} aria-label={t("settings.company.site_region")} disabled={ro} className="h-10" />
                {!ro ? (
                  <Button variant="ghost" size="icon" className="size-10 shrink-0 text-danger" onClick={() => setSiteRows(siteRows.filter((_, j) => j !== i))} aria-label={t("common.remove_row")}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            ))}
            {!ro ? (
              <Button variant="outline" size="sm" onClick={() => setSiteRows([...siteRows, { id: "", name: "", region: "" }])}>
                <Plus /> {t("common.add_row")}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.company.wash_prices")}</CardTitle>
            <CardDescription>{t("expenses.washing.description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {priceRows.map((p, i) => (
              <Field key={p.category}>
                <FieldLabel htmlFor={`price-${p.category}`}>{t(`expenses.washing.category.${p.category}`)}</FieldLabel>
                <div className="relative">
                  <Input id={`price-${p.category}`} type="number" inputMode="numeric" value={p.price_tzs} onChange={(e) => setPriceRows(priceRows.map((x, j) => (j === i ? { ...x, price_tzs: Number(e.target.value) } : x)))} disabled={ro} className="h-10 pr-12" />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">TZS</span>
                </div>
              </Field>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.company.leave_categories")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {catRows.map((c, i) => (
              <div key={c.id || `new-${i}`} className="flex items-center gap-2">
                <Input value={c.name} onChange={(e) => setCatRows(catRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={t("expenses.leave.category")} disabled={ro} className="h-10" />
                <label className="flex min-h-[40px] shrink-0 items-center gap-2 text-xs">
                  <Checkbox checked={c.counts_against_balance} disabled={ro} onCheckedChange={(v) => setCatRows(catRows.map((x, j) => (j === i ? { ...x, counts_against_balance: !!v } : x)))} />
                  {t("settings.company.counts_against_balance")}
                </label>
                {!ro ? (
                  <Button variant="ghost" size="icon" className="size-10 shrink-0 text-danger" onClick={() => setCatRows(catRows.filter((_, j) => j !== i))} aria-label={t("common.remove_row")}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            ))}
            {!ro ? (
              <Button variant="outline" size="sm" onClick={() => setCatRows([...catRows, { id: "", name: "", counts_against_balance: true }])}>
                <Plus /> {t("common.add_row")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.company.vehicle_targets")}</CardTitle>
          <CardDescription>{t("expenses.fuel.target")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicleRows.map((v, i) => (
            <Field key={v.id}>
              <FieldLabel htmlFor={`target-${v.id}`}>
                {v.registration} <span className="font-normal text-muted-foreground">({v.make} {v.model})</span>
              </FieldLabel>
              <div className="relative">
                <Input id={`target-${v.id}`} type="number" inputMode="decimal" step="0.1" value={v.target_km_per_l ?? ""} onChange={(e) => setVehicleRows(vehicleRows.map((x, j) => (j === i ? { ...x, target_km_per_l: e.target.value === "" ? null : Number(e.target.value) } : x)))} disabled={ro} className="h-10 pr-14" />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">km/L</span>
              </div>
            </Field>
          ))}
        </CardContent>
      </Card>

      {!ro ? <FormActions onSave={saveAll} busy={busy} /> : null}
    </div>
  );
}
