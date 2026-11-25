import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/patterns/status-chip";
import { SignatureSummary, type SignatureValue } from "@/components/patterns/signature-field";
import { JmpReviewPanel, type JmpReview } from "@/components/modules/jmp-review-panel";
import { AttachmentsBox } from "@/components/patterns/attachments-box";
import type { DocRef } from "@/components/patterns/doc-button";
import { WorkOrderEmail } from "@/components/modules/work-order-email";
import { TravelNotify } from "@/components/modules/travel-notify";
import { ViewAllDialog } from "@/components/modules/view-all-dialog";
import { ExportMenu } from "@/components/patterns/export-menu";
import { ToolboxCoverage, type CoverageTopic } from "@/components/modules/toolbox-coverage";
import { PostCrashResponse, type PcrStepRow } from "@/components/modules/post-crash-response";
import { toolboxCounts } from "@/modules/expenses";
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

/** Total topics and subtopics, and how many of each are covered. */
function toolboxTiles(c: { topics: number; topicsCovered: number; subtopics: number; subtopicsCovered: number }) {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return [
    { label: t("toolbox.tile.topics"), value: formatNumber(c.topics) },
    { label: t("toolbox.tile.subtopics"), value: formatNumber(c.subtopics) },
    { label: t("toolbox.tile.topics_covered"), value: formatNumber(c.topicsCovered), sub: pct(c.topicsCovered, c.topics), tone: c.topicsCovered < c.topics ? ("warning" as const) : undefined },
    { label: t("toolbox.tile.subtopics_covered"), value: formatNumber(c.subtopicsCovered), sub: pct(c.subtopicsCovered, c.subtopics), tone: c.subtopicsCovered < c.subtopics ? ("warning" as const) : undefined },
  ];
}

/** The travellers' emails or phones, comma separated (null when none has one). */
function contactsOf(record: Record<string, unknown>, key: "email" | "phone"): string | null {
  const list = Array.isArray(record.traveller_list) ? (record.traveller_list as Record<string, unknown>[]) : [];
  const values = list.map((r) => String(r[key] ?? "").trim()).filter(Boolean);
  return values.length ? values.join(", ") : null;
}

/**
 * Data added to a loaded record on the server. incident_vehicle_docs: the documents of each vehicle
 * involved. Our vehicles: the registration card and insurance policy from the fleet, and the licence of
 * our driver (from the driver record, or attached to the incident when the driver is not in our
 * records). Another road user's vehicle: its registration card and insurance policy, attached on it.
 */
export async function enrichRecord(name: string, record: Record<string, unknown>) {
  if (name !== "incident_vehicle_docs") return;
  const rows = Array.isArray(record.vehicles) ? (record.vehicles as Record<string, unknown>[]) : [];
  if (rows.length === 0) return;
  const supabase = await createClient();
  const REG = t("fleet.doc.registration");
  const INS = t("fleet.doc.insurance_policy");
  const LIC = t("drivers.doc.licence");
  const is = (label: string) => (d: DocRef) => d.label.trim().toLowerCase() === label.toLowerCase();

  const fleetIds = [...new Set(rows.filter((r) => r.vehicle_source !== "other" && r.vehicle_id).map((r) => r.vehicle_id as string))];
  const otherIds = rows.filter((r) => r.vehicle_source === "other" && r.id).map((r) => r.id as string);
  const driverId = record.driver_source !== "other" ? ((record.driver_id as string | null) ?? null) : null;

  const [{ data: insurance }, { data: licences }] = await Promise.all([
    fleetIds.length ? supabase.from("vehicle_insurance").select("id, vehicle_id, end_date").in("vehicle_id", fleetIds).is("deleted_at", null).order("end_date", { ascending: false, nullsFirst: false }) : Promise.resolve({ data: [] }),
    driverId ? supabase.from("driver_licences").select("id, expiry_date").eq("driver_id", driverId).is("deleted_at", null).order("expiry_date", { ascending: false, nullsFirst: false }) : Promise.resolve({ data: [] }),
  ]);
  const insRows = (insurance ?? []) as { id: string; vehicle_id: string }[];
  const licRows = (licences ?? []) as { id: string }[];
  const [vehicleDocs, insDocs, licDocs, incidentDocs, otherDocs] = await Promise.all([
    loadDocs("vehicles", fleetIds),
    loadDocs("vehicle_insurance", insRows.map((x) => x.id)),
    loadDocs("driver_licences", licRows.map((x) => x.id)),
    driverId ? Promise.resolve(new Map<string, DocRef[]>()) : loadDocs("incidents", [record.id as string]),
    loadDocs("incident_vehicles", otherIds),
  ]);
  // The newest insurance (and licence) that has its document.
  const policyOf = (vehicleId: string) => {
    for (const ins of insRows.filter((x) => x.vehicle_id === vehicleId)) {
      const d = (insDocs.get(ins.id) ?? []).find(is(INS)) ?? (insDocs.get(ins.id) ?? [])[0];
      if (d) return d;
    }
    return (vehicleDocs.get(vehicleId) ?? []).find(is(INS)) ?? null;
  };
  let licence: DocRef | null = null;
  for (const l of licRows) {
    licence = (licDocs.get(l.id) ?? [])[0] ?? null;
    if (licence) break;
  }
  if (!driverId) licence = (incidentDocs.get(record.id as string) ?? []).find(is(LIC)) ?? null;

  for (const r of rows) {
    if (r.vehicle_source === "other") {
      const own = otherDocs.get(r.id as string) ?? [];
      const reg = own.find(is(REG));
      const ins = own.find(is(INS));
      r._docs = own;
      r._missing = [...(reg ? [] : [REG]), ...(ins ? [] : [INS])];
      r._upload = { table: "incident_vehicles", rowId: r.id, resource: "expenses.safety.incidents", bucket: "incident-files" };
    } else {
      const vid = (r.vehicle_id as string | null) ?? "";
      const reg = (vehicleDocs.get(vid) ?? []).find(is(REG)) ?? null;
      const ins = vid ? policyOf(vid) : null;
      r._docs = [reg, ins, licence].filter((d): d is DocRef => !!d);
      r._missing = [...(reg ? [] : [REG]), ...(ins ? [] : [INS]), ...(licence ? [] : [LIC])];
      r._upload = null;
    }
  }
}

/** Custom blocks rendered under a record form. */
export async function DetailExtra({ name, record }: { name: string; record: Record<string, unknown>; options: LoadedOptions }) {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();

  switch (name) {
    case "outstation_driver": {
      // Under the decision: a button opening everything this driver was given (the same totals as the
      // list, then each allowance).
      const driverId = record.driver_id as string | null;
      if (!driverId) return null;
      const { data } = await supabase
        .from("outstation_requests")
        .select("id, date_from, date_to, location, total_days, allowance_tzs, other_total_tzs, total_cost_tzs, status, driver:drivers(full_name)")
        .eq("driver_id", driverId)
        .is("deleted_at", null)
        .order("date_from", { ascending: false })
        .limit(500);
      const rows = (data ?? []) as { id: string; date_from: string; date_to: string; location: string | null; total_days: number | null; allowance_tzs: number | null; other_total_tzs: number | null; total_cost_tzs: number | null; status: string }[];
      const counted = rows.filter((r) => r.status !== "rejected" && r.status !== "draft");
      const sum = (k: "allowance_tzs" | "other_total_tzs" | "total_cost_tzs") => counted.reduce((s, r) => s + Number(r[k] ?? 0), 0);
      const driverName = ((data ?? [])[0] as { driver?: { full_name?: string } | null } | undefined)?.driver?.full_name;
      return (
        <ViewAllDialog
          label={t("admin.outstation.view_all_driver")}
          title={driverName ? t("admin.outstation.driver_allowances_of", { name: driverName }) : t("admin.outstation.driver_allowances")}
          description={t("admin.outstation.driver_allowances_hint")}
        >
        <div className="space-y-4">
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
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-160 text-sm">
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
        </ViewAllDialog>
      );
    }
    case "petty_cash_transactions": {
      // Under the decision: a button opening the totals and every spend of this petty cash, each
      // recorded and verified one by one. Spending needs the proof of payment.
      const id = record.id as string;
      const [{ data: txns }, { data: proof }] = await Promise.all([
        supabase.from("petty_cash_transactions").select("id, txn_date, description, quantity, unit, price_tzs, amount_tzs, status, approval_step, verified_by").eq("petty_cash_request_id", id).is("deleted_at", null).order("txn_date", { ascending: false }),
        supabase.from("attachments").select("id").eq("table_name", "petty_cash_requests").eq("row_id", id).is("deleted_at", null).ilike("label", `${t("admin.petty_cash.doc.proof_of_payment")}%`).limit(1),
      ]);
      const rows = (txns ?? []) as { id: string; txn_date: string; description: string; quantity: number; unit: string | null; price_tzs: number; amount_tzs: number; status: string; verified_by: string | null }[];
      const approved = record.status === "approved";
      const hasProof = (proof ?? []).length > 0;
      const canRecord = approved && hasProof && session.can("expenses.admin.petty_cash", "create");
      // A draft (or rejected) transaction can be changed by anyone who records petty cash.
      const canChangeDraft = session.can("expenses.admin.petty_cash", "create") || session.can("expenses.admin.petty_cash", "edit");
      const verifiedWord = (s: string) => (s === "approved" ? t("status.verified") : undefined);
      const statusText = (s: string) => verifiedWord(s) ?? t(`status.${s}`);
      // Export: the transactions as shown (with who verified each).
      const exportColumns = [
        { key: "date", header: t("common.date") },
        { key: "description", header: t("admin.petty_cash.description_field") },
        { key: "quantity", header: t("expenses.misc.quantity") },
        { key: "unit", header: t("expenses.misc.unit") },
        { key: "price", header: t("admin.petty_cash.price") },
        { key: "amount", header: t("expenses.misc.amount") },
        { key: "status", header: t("common.status") },
        { key: "verified_by", header: t("admin.petty_cash.verified_by") },
      ];
      const exportRows = rows.map((r) => ({
        date: formatDate(r.txn_date),
        description: r.description,
        quantity: Number(r.quantity),
        unit: r.unit ?? "",
        price: Number(r.price_tzs),
        amount: Number(r.amount_tzs),
        status: statusText(r.status),
        verified_by: r.verified_by ?? "",
      }));
      const canExport = session.can("expenses.admin.petty_cash", "export");
      const spent = rows.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.amount_tzs ?? 0), 0);
      const pending = rows.filter((r) => r.status === "submitted").reduce((s, r) => s + Number(r.amount_tzs ?? 0), 0);
      const received = Number(record.amount_received_tzs ?? 0);
      return (
        <ViewAllDialog label={t("admin.petty_cash.view_all_transactions")} title={t("admin.petty_cash.transactions")} description={t("admin.petty_cash.view_all_hint", { count: rows.length })}>
        <div className="space-y-4">
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
              <div className="flex flex-wrap gap-2">
                {canExport ? (
                  <ExportMenu
                    columns={exportColumns}
                    rows={exportRows}
                    filename={`petty-cash-transactions-${String(record.requester_name ?? "").trim() || id.slice(0, 8)}`}
                    title={t("admin.petty_cash.transactions")}
                    subtitle={[record.requester_name, record.request_date ? formatDate(record.request_date as string) : null, record.purpose].filter(Boolean).join(" · ")}
                  />
                ) : null}
                {canRecord ? (
                  <Button asChild className="h-10">
                    <Link href={`/administration/petty-cash/transactions/new?request=${id}`}>
                      <Plus /> {t("admin.petty_cash.add_transaction")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.petty_cash.no_transactions")}</p>
              ) : (
                <table className="w-full min-w-140 text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">{t("common.date")}</th>
                      <th className="py-1 pr-3">{t("admin.petty_cash.description_field")}</th>
                      <th className="py-1 pr-3 text-right">{t("expenses.misc.quantity")}</th>
                      <th className="py-1 pr-3 text-right">{t("admin.petty_cash.price")}</th>
                      <th className="py-1 pr-3 text-right">{t("expenses.misc.amount")}</th>
                      <th className="py-1 pr-3">{t("common.status")}</th>
                      <th className="py-1 pr-3">{t("admin.petty_cash.verified_by")}</th>
                      <th className="py-1">
                        <span className="sr-only">{t("common.actions")}</span>
                      </th>
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
                        <td className="py-1.5 pr-3">
                          <StatusChip status={r.status} label={verifiedWord(r.status)} />
                        </td>
                        <td className="py-1.5 pr-3 text-xs whitespace-pre-line">{r.verified_by || <span className="text-muted-foreground">—</span>}</td>
                        <td className="py-1.5 text-right">
                          {canChangeDraft && (r.status === "draft" || r.status === "rejected") ? (
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/administration/petty-cash/transactions/${r.id}?edit=1`}>
                                <Pencil /> {t("common.edit")}
                              </Link>
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
        </ViewAllDialog>
      );
    }
    case "post_crash_response": {
      // Steps I to V of the response; responses recorded before the steps stay listed below them.
      const id = record.id as string;
      if (!id) return null;
      const [{ data: steps }, { data: earlier }] = await Promise.all([
        supabase.from("incident_response_steps").select("id, step, status, details, opened_at, closed_at").eq("incident_id", id).is("deleted_at", null),
        supabase.from("incident_responses").select("id, response_date, response, responsible").eq("incident_id", id).is("deleted_at", null).order("response_date"),
      ]);
      const older = (earlier ?? []) as { id: string; response_date: string; response: string; responsible: string | null }[];
      const canWork = session.can("expenses.safety.incidents", "create") || session.can("expenses.safety.incidents", "edit");
      return (
        <>
          <PostCrashResponse
            incidentId={id}
            injuries={Number(record.injuries_count ?? 0)}
            fatalities={Number(record.fatalities_count ?? 0)}
            steps={(steps ?? []) as PcrStepRow[]}
            canWork={canWork}
            path="/expenses/safety/incidents"
          />
          {older.length ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">{t("pcr.earlier")}</CardTitle>
                <CardDescription>{t("pcr.earlier_hint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {older.map((r) => (
                    <li key={r.id} className="rounded-lg border p-2">
                      <span className="font-medium tabular-nums">{formatDate(r.response_date)}</span>: <span className="whitespace-pre-line">{r.response}</span>
                      {r.responsible ? <span className="text-muted-foreground"> ({r.responsible})</span> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      );
    }
    case "toolbox_coverage": {
      // The talk's totals, then each topic with its subtopics to tick and its proof.
      const id = record.id as string;
      if (!id) return null;
      const { data } = await supabase
        .from("toolbox_topics")
        .select("id, title, covered, line_no, subtopics:toolbox_subtopics(id, title, covered, line_no, deleted_at)")
        .eq("plan_id", id)
        .is("deleted_at", null)
        .order("line_no");
      const raw = (data ?? []) as { id: string; title: string; covered: boolean; subtopics: { id: string; title: string; covered: boolean; line_no: number; deleted_at: string | null }[] | null }[];
      const topics: CoverageTopic[] = raw.map((x) => ({
        id: x.id,
        title: x.title,
        covered: x.covered,
        subtopics: (x.subtopics ?? []).filter((s) => !s.deleted_at).sort((a, b) => a.line_no - b.line_no).map((s) => ({ id: s.id, title: s.title, covered: s.covered })),
      }));
      const docs = await loadDocs("toolbox_topics", topics.map((x) => x.id));
      const c = toolboxCounts([{ topic_rows: topics.map((x) => ({ covered: x.covered, deleted_at: null, subtopics: x.subtopics.map((s) => ({ covered: s.covered, deleted_at: null })) })) }]);
      const canTick = session.can("expenses.trainings.toolbox", "create") || session.can("expenses.trainings.toolbox", "edit");
      return (
        <div className="mt-6 space-y-4">
          <HubSummary tiles={toolboxTiles(c)} />
          <ToolboxCoverage planId={id} topics={topics} docs={Object.fromEntries(docs)} canTick={canTick} canAttach={canTick} />
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
    case "travel_notify": {
      // Send the pickup details to the traveller by email and SMS.
      if (!record.id) return null;
      return (
        <TravelNotify
          id={record.id as string}
          path={record.direction === "arrival" ? "/travel/arrivals" : "/travel/departures"}
          email={contactsOf(record, "email") ?? ((record.traveller_email as string | null) ?? null)}
          phone={contactsOf(record, "phone") ?? ((record.traveller_phone as string | null) ?? null)}
          sentAt={(record.notified_at as string | null) ?? null}
          sentTo={(record.notified_to as string | null) ?? null}
          canSend={session.can("expenses.travel", "edit") || session.can("expenses.travel", "create")}
        />
      );
    }
    case "work_order_email": {
      // Send the work order to the service provider by email.
      if (!record.id) return null;
      return (
        <WorkOrderEmail
          id={record.id as string}
          email={(record.provider_email as string | null) ?? null}
          emailedAt={(record.emailed_at as string | null) ?? null}
          emailedTo={(record.emailed_to as string | null) ?? null}
          canSend={session.can("expenses.maintenance.costs", "edit") || session.can("expenses.maintenance.costs", "create")}
        />
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
export async function ListExtra({ name, searchParams, landOn }: { name: string; searchParams?: Record<string, string | string[] | undefined>; landOn?: "month" | "day" }) {
  // The summary cards follow the list's dates (the current month or today when none are chosen).
  const range = rangeFromParams(searchParams, { defaultMonth: landOn === "month", defaultDay: landOn === "day" });
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
    case "toolbox_summary": {
      // Topics and subtopics of the talks in the chosen dates, and how many are covered.
      let q = supabase.from("toolbox_plans").select("id, topic_rows:toolbox_topics(covered, deleted_at, subtopics:toolbox_subtopics(covered, deleted_at))").is("deleted_at", null).limit(2000);
      if (range) q = q.gte("date_from", range.from).lte("date_from", range.to);
      const { data } = await q;
      const c = toolboxCounts((data ?? []) as Parameters<typeof toolboxCounts>[0]);
      return (
        <>
          <SummaryDates label={when} />
          <HubSummary tiles={toolboxTiles(c)} />
        </>
      );
    }
    case "incident_summary": {
      // Accidents and near misses, injuries and fatalities in the chosen dates.
      let q = supabase.from("incidents").select("incident_type, injuries_count, fatalities_count").is("deleted_at", null).limit(5000);
      if (range) q = q.gte("occurred_at", `${range.from}T00:00:00+03:00`).lte("occurred_at", `${range.to}T23:59:59+03:00`);
      const { data } = await q;
      const rows = (data ?? []) as { incident_type: string | null; injuries_count: number | null; fatalities_count: number | null }[];
      const nearMisses = rows.filter((r) => r.incident_type === "near_miss").length;
      const sum = (k: "injuries_count" | "fatalities_count") => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
      const fatalities = sum("fatalities_count");
      return (
        <>
          <SummaryDates label={when} />
          <HubSummary
            tiles={[
              { label: t("expenses.safety.tile.total"), value: formatNumber(rows.length), sub: t("expenses.safety.tile.total_sub", { accidents: rows.length - nearMisses, near_misses: nearMisses }) },
              { label: t("expenses.safety.tile.injuries"), value: formatNumber(sum("injuries_count")), sub: t("expenses.safety.tile.in_records", { count: rows.length }) },
              { label: t("expenses.safety.tile.fatalities"), value: formatNumber(fatalities), sub: t("expenses.safety.tile.in_records", { count: rows.length }), tone: fatalities ? "danger" : undefined },
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
