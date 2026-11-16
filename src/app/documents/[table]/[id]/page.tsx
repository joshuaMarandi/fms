import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { brandLines, SYSTEM_NAME } from "@/lib/branding";
import { formatDate, formatNumber } from "@/lib/utils";
import { hasKey, t } from "@/i18n";
import { DocumentToolbar } from "./document-toolbar";
import { StatusSeal, sealFor } from "./status-seal";

export const metadata: Metadata = { title: "Request document", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Table = "vehicle_requests" | "fuel_requests" | "leave_requests" | "maintenance_requests";
type Sig = { name?: string; signed_at?: string; image?: string; method?: string } | null;
type Field = { label: string; value: React.ReactNode; wide?: boolean };
type Section = { title: string; fields?: Field[]; body?: React.ReactNode; seal?: boolean };
type HistoryRow = { at: string; action: string; who: string; detail: string | null };

const DOC: Record<Table, { title: string; ref: string; noun: string }> = {
  vehicle_requests: { title: "Vehicle request", ref: "VR", noun: "Vehicle request" },
  fuel_requests: { title: "Fuel request", ref: "FR", noun: "Fuel request" },
  leave_requests: { title: "Leave request", ref: "LR", noun: "Leave request" },
  maintenance_requests: { title: "Maintenance request", ref: "MR", noun: "Maintenance request" },
};

const STATUS_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  approved: { bg: "#ddefe7", fg: "#0b4a3d", border: "#0f5c4d" },
  completed: { bg: "#ddefe7", fg: "#0b4a3d", border: "#0f5c4d" },
  rejected: { bg: "#f9e1de", fg: "#8a1c12", border: "#8a1c12" },
  submitted: { bg: "#fbefd5", fg: "#6b4300", border: "#d98b1f" },
  draft: { bg: "#e8e7e1", fg: "#3f4a46", border: "#9aa39f" },
};

const lbl = (key: string, fallback: string) => (hasKey(key) ? t(key) : fallback);
const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const time = (v: unknown) => (v ? String(v).slice(0, 5) : "—");

/** A printable, clean record of one request: details, decision, what followed, and its full history. */
export default async function RequestDocumentPage({ params }: PageProps<"/documents/[table]/[id]">) {
  const { table: tableParam, id } = await params;
  if (!(tableParam in DOC) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const table = tableParam as Table;
  const session = await requireSession();
  const supabase = await createClient();
  const doc = DOC[table];

  const select =
    table === "vehicle_requests"
      ? "*"
      : table === "fuel_requests"
        ? "*, vehicle:vehicles(registration, make, model, fuel_tank_capacity_l), driver:drivers(full_name)"
        : table === "leave_requests"
          ? "*, category:leave_categories(name)"
          : "*, vehicle:vehicles(registration, make, model), driver:drivers(full_name)";
  const { data: rec } = await supabase.from(table).select(select).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!rec) notFound();
  const r = rec as unknown as Record<string, unknown>;

  const people = new Set<string>([r.created_by, r.approved_by, r.employee_id, r.requester_id].filter((x): x is string => typeof x === "string"));
  const [{ data: history }, { data: profiles }] = await Promise.all([
    supabase.rpc("request_history", { p_table: table, p_id: id }),
    people.size ? supabase.from("profiles").select("id, full_name, job_title").in("id", [...people]) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = (uid: unknown) => ((profiles ?? []) as { id: string; full_name: string }[]).find((p) => p.id === uid)?.full_name ?? null;
  await supabase.rpc("log_record_view", { p_table: table, p_id: id });

  const status = String(r.status ?? "draft");
  const decided = status === "approved" || status === "rejected" || status === "completed";
  const sections: Section[] = [];

  // ---------------------------------------------------------------- details
  if (table === "vehicle_requests") {
    sections.push({
      title: "Vehicle request details",
      fields: [
        { label: "Requested by", value: dash(r.requester_name ?? nameOf(r.created_by)) },
        { label: "Phone", value: dash(r.requester_phone) },
        { label: "Date and time of request", value: formatDate(r.requested_at as string, true) },
        { label: "Trip", value: r.trip_type === "long" ? "Long trip" : "Short or town trip" },
        { label: "Date vehicle needed", value: `${formatDate(r.date_needed as string)}${r.date_to ? ` to ${formatDate(r.date_to as string)}` : ""}` },
        { label: "Time", value: `${time(r.time_from)} to ${time(r.time_to)}` },
        { label: "Departure time", value: time(r.departure_time) },
        { label: "Duration", value: r.duration_hours ? `${formatNumber(Number(r.duration_hours), 1)} hours` : "—" },
        { label: "Destination", value: dash(r.destination) },
        { label: "Occupants", value: dash(r.occupants) },
        { label: "Purpose", value: `${r.purpose_type === "personal" ? "Personal" : "Official"}: ${dash(r.purpose)}`, wide: true },
      ],
    });
  } else if (table === "fuel_requests") {
    const v = r.vehicle as { registration?: string; make?: string; model?: string; fuel_tank_capacity_l?: number } | null;
    sections.push({
      title: "Fuel request details",
      fields: [
        { label: "Vehicle", value: v ? `${v.registration} (${v.make} ${v.model})` : "—" },
        { label: "Driver", value: dash((r.driver as { full_name?: string } | null)?.full_name) },
        { label: "Date of request", value: formatDate(r.request_date as string) },
        { label: "Tank capacity", value: v?.fuel_tank_capacity_l ? `${formatNumber(v.fuel_tank_capacity_l)} L` : "—" },
        { label: "Previous odometer", value: r.previous_odometer != null ? `${formatNumber(Number(r.previous_odometer))} km` : "—" },
        { label: "Current odometer", value: r.current_odometer != null ? `${formatNumber(Number(r.current_odometer))} km` : "—" },
        { label: "Km run", value: r.previous_odometer != null && r.current_odometer != null ? `${formatNumber(Number(r.current_odometer) - Number(r.previous_odometer))} km` : "—" },
        { label: "Fuel required", value: r.fuel_required_l != null ? `${formatNumber(Number(r.fuel_required_l), 1)} L` : "—" },
        { label: "Fuel filled last time", value: r.fuel_filled_l != null ? `${formatNumber(Number(r.fuel_filled_l), 1)} L` : "—" },
      ],
    });
  } else if (table === "leave_requests") {
    sections.push({
      title: "Leave request details",
      fields: [
        { label: "Employee", value: dash(nameOf(r.employee_id) ?? nameOf(r.created_by)) },
        { label: "Leave type", value: dash((r.category as { name?: string } | null)?.name) },
        { label: "From", value: formatDate(r.date_from as string) },
        { label: "To", value: formatDate(r.date_to as string) },
        { label: "Days", value: dash(r.total_days) },
        { label: "Reason", value: dash(r.reason), wide: true },
      ],
    });
  } else {
    const v = r.vehicle as { registration?: string; make?: string; model?: string } | null;
    const faults = Array.isArray(r.faults) ? (r.faults as string[]).map((f) => lbl(`expenses.maintenance.fault.${f}`, f)).join(", ") : "—";
    sections.push({
      title: "Maintenance request details",
      fields: [
        { label: "Vehicle", value: v ? `${v.registration} (${v.make} ${v.model})` : "—" },
        { label: "Driver", value: dash((r.driver as { full_name?: string } | null)?.full_name) },
        { label: "Date of request", value: formatDate(r.request_date as string) },
        { label: "Odometer", value: r.odometer_km != null ? `${formatNumber(Number(r.odometer_km))} km` : "—" },
        { label: "Reason", value: r.reason === "other" ? dash(r.reason_other) : lbl(`expenses.maintenance.reason.${r.reason}`, dash(r.reason)) },
        { label: "Faults", value: faults || "—" },
        { label: "Fault details", value: dash(r.fault_details), wide: true },
      ],
    });
  }

  // ---------------------------------------------------------------- decision
  const sig = r.approver_signature as Sig;
  sections.push({
    title: "Final review and decision",
    seal: true,
    fields: [
      { label: "Decision", value: <StatusPill status={status} /> },
      { label: "Decided by", value: decided ? dash((r.approver_name as string) || nameOf(r.approved_by)) : "Waiting for a decision" },
      ...(r.approver_position ? [{ label: "Position", value: String(r.approver_position) }] : []),
      { label: "Date", value: decided && r.approved_at ? formatDate(r.approved_at as string, true) : "—" },
      ...(table === "fuel_requests" && r.approved_l != null ? [{ label: "Litres approved", value: `${formatNumber(Number(r.approved_l), 1)} L` }] : []),
      ...(status === "rejected" && r.rejection_reason ? [{ label: "Reason for rejection", value: String(r.rejection_reason), wide: true }] : []),
      { label: "Signature", value: <Signature sig={status === "approved" || status === "completed" ? sig : null} />, wide: true },
    ],
  });

  // ---------------------------------------------------------------- what followed
  if (table === "vehicle_requests") {
    const [{ data: assignment }, { data: reviews }] = await Promise.all([
      supabase.from("vehicle_assignments").select("*, driver:drivers(full_name, phone), vehicle:vehicles(registration, make, model)").eq("vehicle_request_id", id).is("deleted_at", null).maybeSingle(),
      supabase.from("jmp_reviews").select("*").eq("vehicle_request_id", id).order("step_order"),
    ]);
    const a = assignment as Record<string, unknown> | null;
    if (a) {
      const d = a.driver as { full_name?: string; phone?: string } | null;
      const v = a.vehicle as { registration?: string; make?: string; model?: string } | null;
      sections.push({
        title: "Assigned driver and vehicle",
        fields: [
          { label: "Driver", value: d ? `${d.full_name}${d.phone ? ` (${d.phone})` : ""}` : "—" },
          { label: "Vehicle", value: v ? `${v.registration} (${v.make} ${v.model})` : "—" },
          { label: "Assigned by", value: dash(a.approver_name) },
          { label: "Assigned on", value: a.assigned_at ? formatDate(a.assigned_at as string, true) : "—" },
        ],
      });
    }
    const steps = ((reviews ?? []) as { id: string; step: string; step_order: number; decision: string | null; signed_at: string | null; signature: Sig; rejection_reason: string | null }[]).filter((x) => ["prepare", "requester", "hse_manager"].includes(x.step));
    if (r.trip_type === "long" && steps.length) {
      sections.push({
        title: "Journey management plan",
        body: (
          <div>
            <p className="mb-3 text-[12px] text-[#55625e]">
              Method: <strong className="text-[#17211e]">{r.jmp_method === "manual" ? "Manual (prepared and signed on paper, then uploaded)" : "Automatic (signed in the system)"}</strong>
            </p>
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b-2 border-[#0f3d34] text-left text-[11px] tracking-wide text-[#0f3d34] uppercase">
                  <th className="py-1.5 pr-2">Step</th>
                  <th className="py-1.5 pr-2">Result</th>
                  <th className="py-1.5 pr-2">Signed</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.id} className="border-b border-[#dddcd4] align-top">
                    <td className="py-2 pr-2 font-semibold">{s.step_order}. {lbl(`jmp.step.${s.step}`, s.step)}</td>
                    <td className="py-2 pr-2">{s.decision ? <StatusPill status={s.decision} /> : <span className="text-[#55625e]">Waiting</span>}{s.rejection_reason ? <span className="mt-1 block text-[#8a1c12]">{s.rejection_reason}</span> : null}</td>
                    <td className="py-2 pr-2"><Signature sig={s.decision === "approved" ? s.signature : null} /></td>
                  </tr>
                ))}
                <tr className="align-top">
                  <td className="py-2 pr-2 font-semibold">Control room and emergency response commander</td>
                  <td className="py-2 pr-2" colSpan={2}>{r.jmp_monitors_notified_at ? `Informed by email on ${formatDate(r.jmp_monitors_notified_at as string, true)}` : "Informed by email once the plan is complete"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ),
      });
    }
  } else if (table === "fuel_requests") {
    const { data: issue } = await supabase.from("fuel_issues").select("issue_date, fuel_issued_l, price_per_litre, total_cost_tzs, balance_l").eq("fuel_request_id", id).is("deleted_at", null).maybeSingle();
    const i = issue as Record<string, unknown> | null;
    if (i) {
      sections.push({
        title: "Fuel issued",
        fields: [
          { label: "Date issued", value: formatDate(i.issue_date as string) },
          { label: "Litres issued", value: `${formatNumber(Number(i.fuel_issued_l), 1)} L` },
          { label: "Price per litre", value: `TZS ${formatNumber(Number(i.price_per_litre))}` },
          { label: "Cost", value: `TZS ${formatNumber(Number(i.total_cost_tzs))}` },
          { label: "Balance in tank", value: i.balance_l != null ? `${formatNumber(Number(i.balance_l), 1)} L` : "—" },
        ],
      });
    }
  }

  // ---------------------------------------------------------------- history
  const events = ((history ?? []) as HistoryRow[]).map((h) => ({ ...h, text: historyText(doc.noun, h) }));

  const brand = session.brand;
  // Seal: approved, submitted or rejected, dated with the decision (or when it was sent).
  const seal = sealFor(status);
  const sentAt = [...((history ?? []) as HistoryRow[])].reverse().find((h) => h.action === "submitted" || h.action === "resubmitted")?.at ?? (r.created_at as string | undefined) ?? null;
  const sealDate = decided && r.approved_at ? formatDate(r.approved_at as string) : sentAt ? formatDate(sentAt) : null;
  const ref = `${doc.ref}-${id.slice(0, 8).toUpperCase()}`;
  const printedAt = formatDate(new Date().toISOString(), true);

  return (
    <div className="min-h-screen bg-[#e9e8e2] py-6 print:bg-white print:py-0">
      <DocumentToolbar backHref={backHref(table, id)} />
      <article className="mx-auto w-full max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[#17211e] shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        {/* Letterhead */}
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            {brand?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- company logo on a printed document
              <img src={brand.logoUrl} alt="" className="h-14 w-auto max-w-[140px] object-contain" />
            ) : (
              <span className="flex size-12 items-center justify-center rounded-lg bg-[#0f3d34] text-lg font-black text-white">{(brand?.name ?? SYSTEM_NAME).slice(0, 1)}</span>
            )}
            <div>
              <p className="text-[19px] leading-tight font-black tracking-tight text-[#0f3d34]">{brand?.name ?? SYSTEM_NAME}</p>
              {brandLines(brand).map((line) => (
                <p key={line} className="text-[11.5px] leading-snug text-[#55625e]">
                  {line}
                </p>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            {/* Status seal stamped at an angle, above the reference and printed date. */}
            {seal ? <StatusSeal status={seal} date={sealDate} className="pointer-events-none mb-1 w-[104px] -rotate-[12deg] opacity-90 mix-blend-multiply" /> : null}
            <div className="text-right text-[11.5px] leading-relaxed text-[#55625e]">
              <p>
                Reference <strong className="font-black text-[#17211e]">{ref}</strong>
              </p>
              <p>Printed {printedAt}</p>
            </div>
          </div>
        </header>
        {/* Double rule between the header and the content */}
        <div className="mt-4 border-t-[3px] border-[#0f3d34]" />
        <div className="mt-[3px] border-t border-[#0f3d34]" />

        {/* Title in the middle of the content */}
        <div className="mt-7 mb-6 text-center">
          <h1 className="text-[28px] font-black tracking-tight text-[#0f3d34] uppercase">{doc.title}</h1>
          <div className="mx-auto mt-2 h-[3px] w-16 bg-[#d98b1f]" />
          <div className="mt-3 flex items-center justify-center gap-3 text-[12px] text-[#55625e]">
            <span>{ref}</span>
            <StatusPill status={status} />
          </div>
        </div>

        {sections.map((s, i) => (
          <section key={s.title} className="relative mb-6 break-inside-avoid">
            <h2 className="mb-3 flex items-center gap-3 border-b-2 border-[#0f3d34] pb-1.5 text-[14px] font-black tracking-wide text-[#0f3d34] uppercase">
              <span className="flex size-6 items-center justify-center rounded bg-[#0f3d34] text-[12px] text-white">{i + 1}</span>
              {s.title}
            </h2>
            {s.fields ? (
              <dl className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                {s.fields.map((f) => (
                  <div key={f.label} className={f.wide ? "col-span-2" : undefined}>
                    <dt className="text-[10.5px] font-semibold tracking-wider text-[#55625e] uppercase">{f.label}</dt>
                    <dd className="mt-0.5 text-[13.5px] font-bold whitespace-pre-line">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {s.body}
          </section>
        ))}

        <section className="mb-4 break-inside-avoid">
          <h2 className="mb-3 flex items-center gap-3 border-b-2 border-[#0f3d34] pb-1.5 text-[14px] font-black tracking-wide text-[#0f3d34] uppercase">
            <span className="flex size-6 items-center justify-center rounded bg-[#d98b1f] text-[12px] text-white">{sections.length + 1}</span>
            History
          </h2>
          {events.length === 0 ? (
            <p className="text-[12.5px] text-[#55625e]">No history recorded.</p>
          ) : (
            <ol className="relative ml-2 border-l-2 border-[#dddcd4]">
              {events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative mb-2.5 pl-5 last:mb-0">
                  <span className="absolute top-1 -left-[7px] size-3 rounded-full border-2 border-white" style={{ background: dotColor(e.action) }} />
                  <p className="text-[12.5px] leading-snug">
                    <strong className="font-bold">{e.text}</strong>
                  </p>
                  <p className="text-[11px] text-[#55625e]">
                    {formatDate(e.at, true)}
                    {e.detail && !["emailed"].includes(e.action) ? ` · ${e.detail}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-[#dddcd4] pt-2 text-[10.5px] text-[#55625e]">
          <span>Printed by {session.profile.full_name} on {printedAt}</span>
          <span>Generated by {SYSTEM_NAME}</span>
        </footer>
      </article>
    </div>
  );
}

function historyText(noun: string, h: HistoryRow) {
  switch (h.action) {
    case "created":
      return `${noun} created by ${h.who}`;
    case "submitted":
      return `${noun} sent for approval`;
    case "resubmitted":
      return `${noun} changed and sent again`;
    case "approved":
    case "approve":
      return h.detail && !h.detail.startsWith("Approval") ? `${h.detail.split(":")[0]} approved by ${h.who}` : `${noun} approved by ${h.who}`;
    case "rejected":
    case "reject":
      return `${noun} rejected by ${h.who}${h.detail && h.detail.includes(":") ? ` (${h.detail.split(":").slice(1).join(":").trim()})` : ""}`;
    case "jmp_approved":
      return `${h.detail ?? "JMP step"}: signed by ${h.who}`;
    case "jmp_rejected":
      return `${h.detail ?? "JMP step"}: rejected by ${h.who}`;
    case "emailed":
      return `${noun} emailed to ${h.who}${h.detail ? `: ${h.detail.toLowerCase()}` : ""}`;
    case "viewed":
      return `${noun} viewed by ${h.who}`;
    default:
      return `${h.action} by ${h.who}`;
  }
}

function dotColor(action: string) {
  if (action.includes("reject")) return "#8a1c12";
  if (action.includes("approv")) return "#0f5c4d";
  if (action === "emailed") return "#d98b1f";
  if (action === "viewed") return "#7a8783";
  return "#0f3d34";
}

function backHref(table: Table, id: string) {
  return table === "vehicle_requests"
    ? `/daily-use/trip-requests/${id}`
    : table === "fuel_requests"
      ? `/daily-use/fuel-requests/${id}`
      : table === "leave_requests"
        ? `/expenses/leave/requests/${id}`
        : `/expenses/maintenance/requests/${id}`;
}

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.draft!;
  const label = hasKey(`status.${status}`) ? t(`status.${status}`) : status;
  return (
    <span className="inline-block rounded border px-2 py-0.5 text-[11px] font-black tracking-wider uppercase" style={{ background: tone.bg, color: tone.fg, borderColor: tone.border }}>
      {label}
    </span>
  );
}

function Signature({ sig }: { sig: Sig }) {
  if (!sig) return <span className="font-normal text-[#55625e]">Not signed</span>;
  return (
    <span className="inline-flex items-center gap-3">
      {sig.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- drawn signature
        <img src={sig.image} alt="" className="h-10 w-auto" />
      ) : (
        <span className="border-b border-[#17211e] px-1 font-serif text-[16px] italic">{sig.name}</span>
      )}
      <span className="text-[11px] font-normal text-[#55625e]">
        {sig.name}
        {sig.signed_at ? `, ${formatDate(sig.signed_at, true)}` : ""}
      </span>
    </span>
  );
}
