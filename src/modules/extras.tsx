import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/patterns/status-chip";
import { SignatureSummary, type SignatureValue } from "@/components/patterns/signature-field";
import { FuelIssueForm } from "@/components/modules/fuel-issue-form";
import { JmpReviewPanel, type JmpReview } from "@/components/modules/jmp-review-panel";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { LoadedOptions } from "@/lib/data/records";
import { formatDate, formatNumber, formatTzs } from "@/lib/utils";
import { t } from "@/i18n";

/** Custom blocks rendered under a record form. */
export async function DetailExtra({ name, record, options }: { name: string; record: Record<string, unknown>; options: LoadedOptions }) {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();

  switch (name) {
    case "fuel_issue": {
      if (record.status !== "approved" && record.status !== "completed") return null;
      const [{ data: issue }, { data: price }] = await Promise.all([
        supabase.from("fuel_issues").select("*").eq("fuel_request_id", record.id as string).is("deleted_at", null).maybeSingle(),
        supabase.rpc("fuel_price_on", { p_company: record.company_id as string, p_date: new Date().toISOString().slice(0, 10) }),
      ]);
      const vehicle = options.vehicles?.find((v) => v.value === record.vehicle_id);
      const canIssue = session.can("daily_use.fuel_log", "approve");
      if (!issue && !canIssue) return null;
      return (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{t("daily_use.fuel.manager_view")}</CardTitle>
            <CardDescription>
              {vehicle?.label} · {t("daily_use.fuel.tank_capacity")}: {formatNumber(vehicle?.fuel_tank_capacity_l as number, 0)} L
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FuelIssueForm request={record} issue={issue as Record<string, unknown> | null} vehicle={vehicle ?? null} readOnly={!canIssue} defaultPrice={price ? Number(price) : null} />
          </CardContent>
        </Card>
      );
    }
    case "trip_assignment": {
      const [{ data: assignment }, { data: reviews }] = await Promise.all([
        supabase.from("vehicle_assignments").select("*, driver:drivers(full_name, phone), vehicle:vehicles(registration, make, model)").eq("vehicle_request_id", record.id as string).is("deleted_at", null).maybeSingle(),
        supabase.from("jmp_reviews").select("*").eq("vehicle_request_id", record.id as string).order("step_order"),
      ]);
      if (!assignment && (!reviews || reviews.length === 0)) return null;
      const a = assignment as Record<string, unknown> | null;
      const driver = a?.driver as { full_name: string; phone: string | null } | null;
      const vehicle = a?.vehicle as { registration: string; make: string; model: string } | null;
      return (
        <div className="mt-6 space-y-6">
          {a ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("daily_use.trips.assignment")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t("approval.assigned_driver")}</p>
                  <p className="font-medium">
                    {driver?.full_name ?? t("common.na")} {driver?.phone ? `(${driver.phone})` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("approval.assigned_vehicle")}</p>
                  <p className="font-medium">{vehicle ? `${vehicle.make} ${vehicle.model}, ${vehicle.registration}` : t("common.na")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("approval.approver_name")}</p>
                  <p className="font-medium">{(a.approver_name as string) ?? t("common.na")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("approval.signature")}</p>
                  <SignatureSummary value={a.approver_signature as SignatureValue | null} />
                </div>
                {record.trip_type === "long" ? (
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-xs text-muted-foreground">{t("daily_use.trips.jmp_attach")}</p>
                    <AttachmentsBox table="vehicle_requests" rowId={record.id as string} resource="daily_use.trip_requests" bucket="jmp" labels={[t("daily_use.trips.jmp")]} multiple={false} readOnly={!session.can("daily_use.trip_requests", "approve")} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          {reviews && reviews.length > 0 ? <JmpReviewPanel requestId={record.id as string} reviews={reviews as JmpReview[]} /> : null}
        </div>
      );
    }
    case "works_order": {
      const { data: orders } = await supabase.from("work_orders").select("id, order_number, garage_name, date_out, date_in, total_days, status").eq("maintenance_request_id", record.id as string).is("deleted_at", null);
      const list = (orders ?? []) as Record<string, unknown>[];
      return (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{t("expenses.maintenance.works_order")}</CardTitle>
            <CardDescription>{t("expenses.maintenance.work_orders.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {list.length === 0 ? <p className="text-muted-foreground">{t("common.empty_title")}</p> : null}
            {list.map((o) => (
              <Link key={o.id as string} href={`/expenses/maintenance/work-orders/${o.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40">
                <span>
                  <span className="font-medium">{(o.order_number as string) ?? t("expenses.maintenance.works_order")}</span> · {o.garage_name as string}
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(o.date_out as string)} {o.date_in ? `to ${formatDate(o.date_in as string)}` : ""} {o.total_days !== null && o.total_days !== undefined ? `· ${o.total_days} ${t("common.days")}` : ""}
                  </span>
                </span>
                <StatusChip status={o.status as string} />
              </Link>
            ))}
            {session.can("expenses.maintenance.work_orders", "create") && record.status === "approved" ? (
              <Button asChild variant="outline">
                <Link href={`/expenses/maintenance/work-orders/new?request=${record.id}&vehicle=${record.vehicle_id}`}>{t("expenses.maintenance.work_orders.new")}</Link>
              </Button>
            ) : null}
            {session.can("expenses.maintenance.requests", "approve") ? (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">{t("expenses.maintenance.works_order")}</p>
                <AttachmentsBox table="maintenance_requests" rowId={record.id as string} resource="expenses.maintenance.requests" bucket="forms" labels={[t("expenses.maintenance.doc.works_order")]} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      );
    }
    case "leave_balance": {
      const year = record.date_from ? new Date(record.date_from as string).getFullYear() : new Date().getFullYear();
      const [{ data: bal }, { data: taken }] = await Promise.all([
        supabase.from("v_leave_balances").select("*").eq("employee_id", record.employee_id as string).eq("balance_year", year).maybeSingle(),
        supabase.from("leave_requests").select("id, date_from, date_to, total_days, status, category:leave_categories(name)").eq("employee_id", record.employee_id as string).in("status", ["approved", "completed"]).is("deleted_at", null).order("date_from", { ascending: false }).limit(20),
      ]);
      const b = bal as Record<string, unknown> | null;
      return (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{t("expenses.leave.taken_rows")}</CardTitle>
            <CardDescription>
              {b
                ? `${t("expenses.leave.entitled")}: ${formatNumber(b.entitled_days as number, 1)} · ${t("expenses.leave.taken")}: ${formatNumber(b.days_taken as number, 0)} · ${t("expenses.leave.balance")}: ${formatNumber(b.balance_days as number, 1)}`
                : t("common.na")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">{t("expenses.leave.date_from")}</th>
                  <th className="py-1">{t("expenses.leave.date_to")}</th>
                  <th className="py-1">{t("expenses.leave.days")}</th>
                  <th className="py-1">{t("expenses.leave.category")}</th>
                </tr>
              </thead>
              <tbody>
                {((taken ?? []) as Record<string, unknown>[]).map((r) => (
                  <tr key={r.id as string} className="border-t">
                    <td className="py-1.5">{formatDate(r.date_from as string)}</td>
                    <td className="py-1.5">{formatDate(r.date_to as string)}</td>
                    <td className="py-1.5 tabular-nums">{r.total_days as number}</td>
                    <td className="py-1.5">{(r.category as { name?: string } | null)?.name ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      );
    }
    default:
      return null;
  }
}

/** Custom blocks rendered above a module list. */
export async function ListExtra({ name }: { name: string; searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();

  switch (name) {
    case "wash_report": {
      if (!session.can("expenses.washing", "view") || session.scope("expenses.washing", "view") === "own") return null;
      const { data } = await supabase.from("v_wash_cost_report").select("*").in("status", ["approved", "completed"]).order("request_date", { ascending: false }).limit(500);
      const rows = (data ?? []) as Record<string, unknown>[];
      const total = rows.reduce((s, r) => s + Number(r.cost_tzs ?? 0), 0);
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("expenses.washing.report")}</CardTitle>
            <CardDescription>
              {t("common.total")}: {formatTzs(total)} · {t("common.results", { count: rows.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">{t("fleet.registration")}</th>
                  <th className="py-1 pr-3">{t("common.date")}</th>
                  <th className="py-1 pr-3">{t("expenses.washing.category")}</th>
                  <th className="py-1 pr-3">{t("expenses.washing.provider")}</th>
                  <th className="py-1 text-right">{t("expenses.washing.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((r) => (
                  <tr key={r.id as string} className="border-t">
                    <td className="py-1.5 pr-3">{r.registration as string}</td>
                    <td className="py-1.5 pr-3">{formatDate(r.request_date as string)}</td>
                    <td className="py-1.5 pr-3">{((r.categories as string[]) ?? []).map((c) => t(`expenses.washing.category.${c}`)).join(", ")}</td>
                    <td className="py-1.5 pr-3">{(r.service_provider as string) ?? ""}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatTzs(r.cost_tzs as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      );
    }
    case "leave_balance_view": {
      const { data } = await supabase.from("v_leave_balances").select("*, employee:profiles(full_name)").order("balance_year", { ascending: false }).limit(500);
      const rows = (data ?? []) as Record<string, unknown>[];
      if (rows.length === 0) return null;
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("expenses.leave.balances.title")}</CardTitle>
            <CardDescription>{t("expenses.leave.balances.description")}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">{t("expenses.leave.year")}</th>
                  <th className="py-1 pr-3">{t("expenses.leave.name")}</th>
                  <th className="py-1 pr-3 text-right">{t("expenses.leave.entitled")}</th>
                  <th className="py-1 pr-3 text-right">{t("expenses.leave.carried_over")}</th>
                  <th className="py-1 pr-3 text-right">{t("expenses.leave.taken")}</th>
                  <th className="py-1 text-right">{t("expenses.leave.balance")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id as string} className="border-t">
                    <td className="py-1.5 pr-3">{r.balance_year as number}</td>
                    <td className="py-1.5 pr-3">{(r.employee as { full_name?: string } | null)?.full_name ?? ""}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(r.entitled_days as number, 1)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(r.carried_over_days as number, 1)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(r.days_taken as number, 0)}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{formatNumber(r.balance_days as number, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      );
    }
    default:
      return null;
  }
}
