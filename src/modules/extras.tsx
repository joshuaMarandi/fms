import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignatureSummary, type SignatureValue } from "@/components/patterns/signature-field";
import { JmpReviewPanel, type JmpReview } from "@/components/modules/jmp-review-panel";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { HubSummary } from "@/components/hub/vehicle-hub";
import { loadDocs } from "@/lib/data/docs";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { LoadedOptions } from "@/lib/data/records";
import { formatDate, formatNumber, formatTzs } from "@/lib/utils";
import { t } from "@/i18n";

/** Custom blocks rendered under a record form. */
export async function DetailExtra({ name, record }: { name: string; record: Record<string, unknown>; options: LoadedOptions }) {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();

  switch (name) {
    case "fuel_issue": {
      // Once approved: the totals of the fuel issued (recorded automatically on approval).
      if (record.status !== "approved" && record.status !== "completed") return null;
      const { data: issue } = await supabase.from("fuel_issues").select("km_run, fuel_issued_l, consumption_km_per_l, total_cost_tzs").eq("fuel_request_id", record.id as string).is("deleted_at", null).maybeSingle();
      const i = issue as { km_run: number | null; fuel_issued_l: number | null; consumption_km_per_l: number | null; total_cost_tzs: number | null } | null;
      const prev = record.previous_odometer == null ? null : Number(record.previous_odometer);
      const curr = record.current_odometer == null ? null : Number(record.current_odometer);
      const kmRun = i?.km_run != null ? Number(i.km_run) : prev != null && curr != null ? curr - prev : null;
      const litres = i?.fuel_issued_l != null ? Number(i.fuel_issued_l) : record.approved_l != null ? Number(record.approved_l) : null;
      const ratio = i?.consumption_km_per_l != null ? Number(i.consumption_km_per_l) : kmRun != null && litres ? kmRun / litres : null;
      const cost = i?.total_cost_tzs != null ? Number(i.total_cost_tzs) : null;
      const items = [
        { label: t("daily_use.fuel.km_run"), value: kmRun != null ? `${formatNumber(kmRun)} km` : "—" },
        { label: t("daily_use.fuel.consumption"), value: ratio != null ? `${formatNumber(ratio, 2)} km/L` : "—" },
        { label: t("daily_use.fuel.total_cost"), value: cost != null ? formatTzs(cost) : "—" },
      ];
      return (
        <div className="page-card mt-6 grid gap-4 p-4 sm:grid-cols-3 md:p-5">
          {items.map((x) => (
            <div key={x.label}>
              <p className="text-xs text-muted-foreground">{x.label}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{x.value}</p>
            </div>
          ))}
        </div>
      );
    }
    case "trip_assignment": {
      const [{ data: assignment }, { data: reviews }] = await Promise.all([
        supabase.from("vehicle_assignments").select("*, driver:drivers(full_name, phone), vehicle:vehicles(registration, make, model)").eq("vehicle_request_id", record.id as string).is("deleted_at", null).maybeSingle(),
        supabase.from("jmp_reviews").select("*").eq("vehicle_request_id", record.id as string).order("step_order"),
      ]);
      if (!assignment && (!reviews || reviews.length === 0)) return null;
      // JMP: each step's files, and the step the signed-in person may do now.
      const jmpRows = (reviews ?? []) as JmpReview[];
      const jmpMethod = record.jmp_method === "manual" ? "manual" : "automatic";
      const jmpDocs = await loadDocs("jmp_reviews", jmpRows.map((r) => r.id));
      const nextStep = jmpRows.filter((r) => ["prepare", "requester", "hse_manager"].includes(r.step)).find((r) => r.decision === null) ?? null;
      let actionableId: string | null = null;
      if (nextStep) {
        if (jmpMethod === "manual") {
          const { data: ok } = await supabase.rpc("can_upload_jmp_file", { p_review: nextStep.id });
          if (ok) actionableId = nextStep.id;
        } else if (session.can(nextStep.required_resource, "approve")) {
          actionableId = nextStep.id;
        }
      }
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
          {jmpRows.length > 0 ? (
            <JmpReviewPanel
              requestId={record.id as string}
              reviews={jmpRows.map((r) => ({ ...r, docs: jmpDocs.get(r.id) ?? [] }))}
              method={jmpMethod}
              actionableId={actionableId}
              monitorsNotifiedAt={(record.jmp_monitors_notified_at as string | null) ?? null}
              approved={record.status === "approved" || record.status === "completed"}
            />
          ) : null}
        </div>
      );
    }
    case "works_order": {
      // Maintenance request: the approver attaches the paperwork (works order, job card, invoice).
      if (!session.can("expenses.maintenance.requests", "approve")) return null;
      return (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{t("common.documents")}</CardTitle>
            <CardDescription>{t("common.documents_hint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AttachmentsBox table="maintenance_requests" rowId={record.id as string} resource="expenses.maintenance.requests" bucket="forms" labels={[t("expenses.maintenance.doc.works_order"), t("expenses.maintenance.doc.job_card"), t("expenses.maintenance.doc.invoice")]} />
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
    case "petty_cash_summary": {
      // As on the Excel dashboard: requested, received and spent to date, and the balance in hand.
      const { data } = await supabase.from("petty_cash_requests").select("status, amount_requested_tzs, amount_received_tzs, amount_spent_tzs").is("deleted_at", null).limit(5000);
      const rows = ((data ?? []) as { status: string; amount_requested_tzs: number; amount_received_tzs: number; amount_spent_tzs: number }[]).filter((r) => r.status !== "rejected" && r.status !== "draft");
      const sum = (k: "amount_requested_tzs" | "amount_received_tzs" | "amount_spent_tzs") => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
      const received = sum("amount_received_tzs");
      const spent = sum("amount_spent_tzs");
      return (
        <HubSummary
          tiles={[
            { label: t("admin.petty_cash.total_requested"), value: formatTzs(sum("amount_requested_tzs")), sub: t("admin.petty_cash.to_date") },
            { label: t("admin.petty_cash.total_received"), value: formatTzs(received), sub: t("admin.petty_cash.to_date") },
            { label: t("admin.petty_cash.total_spent"), value: formatTzs(spent), sub: t("admin.petty_cash.to_date") },
            { label: t("admin.petty_cash.balance"), value: formatTzs(received - spent), sub: t("admin.petty_cash.balance_hint"), tone: received - spent < 0 ? "danger" : undefined },
          ]}
        />
      );
    }
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
