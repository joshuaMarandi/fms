import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/patterns/status-chip";
import { SignatureSummary, type SignatureValue } from "@/components/patterns/signature-field";
import { JmpReviewPanel, type JmpReview } from "@/components/modules/jmp-review-panel";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import { HubSummary } from "@/components/hub/vehicle-hub";
import { loadDocs } from "@/lib/data/docs";
import { SummaryDates } from "@/components/hub/daily-use-hub";
import { ViewAllMenu } from "@/components/hub/view-all-menu";
import { rangeFromParams } from "@/lib/date-range";
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
    case "outstation_driver": {
      // Everything this driver was given: the same totals as the list, then each allowance.
      const driverId = record.driver_id as string | null;
      if (!driverId) return null;
      const { data } = await supabase
        .from("outstation_requests")
        .select("id, date_from, date_to, location, total_days, allowance_tzs, other_total_tzs, total_cost_tzs, status")
        .eq("driver_id", driverId)
        .is("deleted_at", null)
        .order("date_from", { ascending: false })
        .limit(500);
      const rows = (data ?? []) as { id: string; date_from: string; date_to: string; location: string | null; total_days: number | null; allowance_tzs: number | null; other_total_tzs: number | null; total_cost_tzs: number | null; status: string }[];
      const counted = rows.filter((r) => r.status !== "rejected" && r.status !== "draft");
      const sum = (k: "allowance_tzs" | "other_total_tzs" | "total_cost_tzs") => counted.reduce((s, r) => s + Number(r[k] ?? 0), 0);
      return (
        <div className="mt-6 space-y-4">
          <HubSummary
            tiles={[
              { label: t("admin.outstation.tile.total_cost"), value: formatTzs(sum("total_cost_tzs")), sub: t("admin.outstation.tile.for_driver", { count: counted.length }) },
              { label: t("admin.outstation.tile.allowance"), value: formatTzs(sum("allowance_tzs")) },
              { label: t("admin.outstation.tile.other"), value: formatTzs(sum("other_total_tzs")) },
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.outstation.driver_allowances")}</CardTitle>
              <CardDescription>{t("admin.outstation.driver_allowances_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3">{t("admin.outstation.date_from")}</th>
                    <th className="py-1 pr-3">{t("admin.outstation.date_to")}</th>
                    <th className="py-1 pr-3">{t("admin.outstation.location")}</th>
                    <th className="py-1 pr-3 text-right">{t("admin.outstation.total_days")}</th>
                    <th className="py-1 pr-3 text-right">{t("admin.outstation.tile.allowance")}</th>
                    <th className="py-1 pr-3 text-right">{t("admin.outstation.tile.other")}</th>
                    <th className="py-1 pr-3 text-right">{t("admin.outstation.total_cost")}</th>
                    <th className="py-1">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.id === record.id ? "border-t bg-muted/40" : "border-t"}>
                      <td className="py-1.5 pr-3">
                        <Link href={`/administration/outstation/${r.id}`} className="font-medium hover:underline">
                          {formatDate(r.date_from)}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3">{formatDate(r.date_to)}</td>
                      <td className="py-1.5 pr-3">{r.location ?? ""}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.total_days ?? ""}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatTzs(Number(r.allowance_tzs ?? 0))}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatTzs(Number(r.other_total_tzs ?? 0))}</td>
                      <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{formatTzs(Number(r.total_cost_tzs ?? 0))}</td>
                      <td className="py-1.5">
                        <StatusChip status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      );
    }
    case "petty_cash_transactions": {
      // Each spend of this petty cash, recorded and approved one by one. Spending needs the proof of payment.
      const id = record.id as string;
      const [{ data: txns }, { data: proof }] = await Promise.all([
        supabase.from("petty_cash_transactions").select("id, txn_date, description, quantity, unit, price_tzs, amount_tzs, status, approval_step").eq("petty_cash_request_id", id).is("deleted_at", null).order("txn_date", { ascending: false }),
        supabase.from("attachments").select("id").eq("table_name", "petty_cash_requests").eq("row_id", id).is("deleted_at", null).ilike("label", `${t("admin.petty_cash.doc.proof_of_payment")}%`).limit(1),
      ]);
      const rows = (txns ?? []) as { id: string; txn_date: string; description: string; quantity: number; unit: string | null; price_tzs: number; amount_tzs: number; status: string }[];
      const approved = record.status === "approved";
      const hasProof = (proof ?? []).length > 0;
      const canRecord = approved && hasProof && session.can("expenses.admin.petty_cash", "create");
      const spent = rows.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.amount_tzs ?? 0), 0);
      const pending = rows.filter((r) => r.status === "submitted").reduce((s, r) => s + Number(r.amount_tzs ?? 0), 0);
      const received = Number(record.amount_received_tzs ?? 0);
      return (
        <div className="mt-6 space-y-4">
          <HubSummary
            tiles={[
              { label: t("admin.petty_cash.amount_approved"), value: record.amount_approved_tzs == null ? "—" : formatTzs(Number(record.amount_approved_tzs)) },
              { label: t("admin.petty_cash.amount_received"), value: formatTzs(received) },
              { label: t("admin.petty_cash.amount_spent"), value: formatTzs(spent), sub: pending ? t("admin.petty_cash.awaiting_approval", { amount: formatTzs(pending) }) : undefined },
              { label: t("admin.petty_cash.balance"), value: formatTzs(received - spent), tone: received - spent < 0 ? "danger" : undefined },
            ]}
          />
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{t("admin.petty_cash.transactions")}</CardTitle>
                <CardDescription>
                  {!approved ? t("admin.petty_cash.spend_after_approval") : !hasProof ? t("admin.petty_cash.spend_after_proof") : t("admin.petty_cash.transactions_hint_new")}
                </CardDescription>
              </div>
              {canRecord ? (
                <Button asChild className="h-10">
                  <Link href={`/administration/petty-cash/transactions/new?request=${id}`}>
                    <Plus /> {t("admin.petty_cash.add_transaction")}
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.petty_cash.no_transactions")}</p>
              ) : (
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">{t("common.date")}</th>
                      <th className="py-1 pr-3">{t("admin.petty_cash.description_field")}</th>
                      <th className="py-1 pr-3 text-right">{t("expenses.misc.quantity")}</th>
                      <th className="py-1 pr-3 text-right">{t("admin.petty_cash.price")}</th>
                      <th className="py-1 pr-3 text-right">{t("expenses.misc.amount")}</th>
                      <th className="py-1">{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-1.5 pr-3">
                          <Link href={`/administration/petty-cash/transactions/${r.id}`} className="font-medium hover:underline">
                            {formatDate(r.txn_date)}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3">{r.description}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {formatNumber(Number(r.quantity), 2)} {r.unit ?? ""}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatTzs(Number(r.price_tzs))}</td>
                        <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{formatTzs(Number(r.amount_tzs))}</td>
                        <td className="py-1.5">
                          <StatusChip status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }
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
export async function ListExtra({ name, searchParams }: { name: string; searchParams?: Record<string, string | string[] | undefined> }) {
  const range = rangeFromParams(searchParams);
  const when = range?.label ?? t("hub.all_time");
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();

  switch (name) {
    case "outstation_summary": {
      // Total cost, allowance and other expenses of the allowances in the chosen dates.
      let q = supabase.from("outstation_requests").select("status, allowance_tzs, other_total_tzs, total_cost_tzs").is("deleted_at", null).limit(5000);
      if (range) q = q.gte("date_from", range.from).lte("date_from", range.to);
      const { data } = await q;
      const rows = ((data ?? []) as { status: string; allowance_tzs: number | null; other_total_tzs: number | null; total_cost_tzs: number | null }[]).filter((r) => r.status !== "rejected" && r.status !== "draft");
      const sum = (k: "allowance_tzs" | "other_total_tzs" | "total_cost_tzs") => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
      return (
        <>
          <SummaryDates label={when} />
          <HubSummary
            tiles={[
              { label: t("admin.outstation.tile.total_cost"), value: formatTzs(sum("total_cost_tzs")), sub: t("admin.outstation.tile.count", { count: rows.length }) },
              { label: t("admin.outstation.tile.allowance"), value: formatTzs(sum("allowance_tzs")) },
              { label: t("admin.outstation.tile.other"), value: formatTzs(sum("other_total_tzs")) },
            ]}
          />
        </>
      );
    }
    case "trip_summary": {
      // Vehicle requests for the chosen dates (all time by default).
      let q = supabase.from("vehicle_requests").select("status, trip_type, requested_at").is("deleted_at", null).limit(10000);
      if (range) q = q.gte("requested_at", range.from).lte("requested_at", `${range.to}T23:59:59`);
      const { data } = await q;
      const rows = (data ?? []) as { status: string; trip_type: string }[];
      const count = (f: (r: { status: string; trip_type: string }) => boolean) => rows.filter(f).length;
      const waiting = count((r) => r.status === "submitted");
      const rejected = count((r) => r.status === "rejected");
      return (
        <>
          <SummaryDates label={when} />
          <HubSummary
            tiles={[
              { label: t("trips.summary.total"), value: formatNumber(rows.length), sub: t("trips.summary.split", { short: count((r) => r.trip_type === "short"), long: count((r) => r.trip_type === "long") }) },
              { label: t("trips.summary.waiting"), value: formatNumber(waiting), tone: waiting ? "warning" : undefined },
              { label: t("trips.summary.approved"), value: formatNumber(count((r) => r.status === "approved" || r.status === "completed")) },
              { label: t("trips.summary.rejected"), value: formatNumber(rejected), tone: rejected ? "danger" : undefined },
            ]}
          />
        </>
      );
    }
    case "petty_cash_summary": {
      // As on the Excel dashboard: requested, received and spent to date, and the balance in hand.
      let pq = supabase.from("petty_cash_requests").select("status, amount_requested_tzs, amount_received_tzs, amount_spent_tzs").is("deleted_at", null).limit(5000);
      if (range) pq = pq.gte("request_date", range.from).lte("request_date", range.to);
      const { data } = await pq;
      const rows = ((data ?? []) as { status: string; amount_requested_tzs: number; amount_received_tzs: number; amount_spent_tzs: number }[]).filter((r) => r.status !== "rejected" && r.status !== "draft");
      const sum = (k: "amount_requested_tzs" | "amount_received_tzs" | "amount_spent_tzs") => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
      const received = sum("amount_received_tzs");
      const spent = sum("amount_spent_tzs");
      return (
        <>
        <ViewAllMenu items={[{ href: "/administration/petty-cash/transactions", label: t("admin.petty_cash.transactions") }]} />
        <SummaryDates label={when} />
        <HubSummary
          tiles={[
            { label: t("admin.petty_cash.total_requested"), value: formatTzs(sum("amount_requested_tzs")) },
            { label: t("admin.petty_cash.total_received"), value: formatTzs(received) },
            { label: t("admin.petty_cash.total_spent"), value: formatTzs(spent) },
            { label: t("admin.petty_cash.balance"), value: formatTzs(received - spent), sub: t("admin.petty_cash.balance_hint"), tone: received - spent < 0 ? "danger" : undefined },
          ]}
        />
        </>
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
