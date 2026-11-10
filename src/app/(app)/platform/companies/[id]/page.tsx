import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RecordTitle } from "@/components/modules/record-title";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils";
import { CompanyForm, type PackageOption } from "../company-form";
import { CompanyStatusChip, formatBytes, formatPrice, loadCompanyRows, type CompanyStatus } from "../../shared";
import { CompanyActions, InviteAdminButton } from "./company-actions";
import type { CompanyInput } from "../../actions";
import { t } from "@/i18n";

export default async function CompanyDetailPage({ params }: PageProps<"/platform/companies/[id]">) {
  const { id } = await params;
  await requirePermission("platform.companies", "view");
  const supabase = await createClient();

  const [{ data: company }, { data: packages }, rows, { data: profiles }, { data: adminRoles }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("packages").select("id, name, max_vehicles, price, currency, billing_period, is_active").is("deleted_at", null).order("sort_order"),
    loadCompanyRows(supabase),
    supabase.from("profiles").select("id, full_name, email, phone, is_active").eq("company_id", id).order("full_name"),
    supabase.from("roles").select("id").eq("is_admin", true),
  ]);
  if (!company) notFound();
  const c = company as Record<string, unknown>;
  const usage = rows.find((r) => r.id === id);
  const pkgs = (packages ?? []) as PackageOption[];
  const pkg = pkgs.find((p) => p.id === c.package_id);

  const adminIds = new Set(((adminRoles ?? []) as { id: string }[]).map((r) => r.id));
  const profileIds = ((profiles ?? []) as { id: string }[]).map((p) => p.id);
  const { data: userRoles } = profileIds.length ? await supabase.from("user_roles").select("user_id, role_id").in("user_id", profileIds) : { data: [] };
  const admins = ((profiles ?? []) as { id: string; full_name: string; email: string | null; phone: string | null; is_active: boolean }[]).filter((p) =>
    ((userRoles ?? []) as { user_id: string; role_id: string }[]).some((ur) => ur.user_id === p.id && adminIds.has(ur.role_id)),
  );

  const vehicles = usage?.vehicles ?? 0;
  const max = pkg?.max_vehicles ?? null;
  const pct = max ? Math.min(100, Math.round((vehicles / max) * 100)) : 0;

  const input: CompanyInput = {
    id,
    name: c.name as string,
    contact_name: (c.contact_name as string) ?? "",
    contact_email: (c.contact_email as string) ?? "",
    contact_phone: (c.contact_phone as string) ?? "",
    address: (c.address as string) ?? "",
    city: (c.city as string) ?? "",
    country: (c.country as string) ?? "",
    package_id: (c.package_id as string) ?? null,
    status: c.status as CompanyInput["status"],
    subscription_start: (c.subscription_start as string) ?? null,
    subscription_end: (c.subscription_end as string) ?? null,
    notes: (c.notes as string) ?? "",
  };

  return (
    <>
      <RecordTitle title={c.name as string} />
      <PageHeader
        title={c.name as string}
        description={[pkg?.name, c.city, c.contact_email].filter(Boolean).join(" · ")}
        actions={
          <>
            <CompanyStatusChip status={c.status as CompanyStatus} />
            <CompanyActions companyId={id} status={c.status as CompanyStatus} />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{t("platform.companies.vehicles")}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatNumber(vehicles)}
              {max ? <span className="text-base font-normal text-muted-foreground"> / {formatNumber(max)}</span> : null}
            </CardTitle>
          </CardHeader>
          {max ? (
            <CardContent className="space-y-1">
              <Progress value={pct} aria-label={t("subscription.vehicle_limit", { count: vehicles, max })} />
              {vehicles >= max ? <p className="text-xs text-warning">{t("platform.companies.over_limit", { count: vehicles, max })}</p> : null}
            </CardContent>
          ) : null}
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{t("platform.companies.users")}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatNumber(usage?.users ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {formatNumber(usage?.drivers ?? 0)} {t("platform.companies.drivers").toLowerCase()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{t("platform.companies.package")}</CardDescription>
            <CardTitle className="text-2xl">{pkg?.name ?? t("platform.companies.no_package")}</CardTitle>
          </CardHeader>
          {pkg ? (
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {formatPrice(pkg.price, pkg.currency)} {t(`platform.packages.period.${pkg.billing_period}`)}
              </p>
            </CardContent>
          ) : null}
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{t("platform.companies.subscription_end")}</CardDescription>
            <CardTitle className="text-2xl">{c.subscription_end ? formatDate(c.subscription_end as string) : t("subscription.no_end")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t("platform.companies.storage")}: {formatBytes(usage?.storage_bytes ?? 0)} · {t("platform.companies.last_activity")}: {formatDate(usage?.last_activity) || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CompanyForm company={input} packages={pkgs} />
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">{t("platform.companies.admins")}</CardTitle>
            <CardDescription>{t("platform.companies.admins_description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {admins.length === 0 ? <p className="rounded-lg bg-warning-bg p-3 text-warning">{t("platform.companies.no_admins")}</p> : null}
            {admins.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <p className="font-medium">{a.full_name}</p>
                <p className="text-xs text-muted-foreground">{[a.email, a.phone].filter(Boolean).join(" · ")}</p>
              </div>
            ))}
            <InviteAdminButton companyId={id} defaults={{ full_name: (c.contact_name as string) ?? "", email: (c.contact_email as string) ?? "", phone: (c.contact_phone as string) ?? "" }} />
            <p className="pt-2 text-xs text-muted-foreground">
              {t("platform.companies.users")}: {formatNumber((profiles ?? []).length)}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
