import { CheckCircle2, CircleDashed } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { RecordTitle } from "@/components/modules/record-title";
import { ViewAllMenu } from "@/components/hub/view-all-menu";
import { ApprovalPanel, type RequestLike, type StepSignoff } from "@/components/patterns/approval-panel";
import { MonthPicker, YearPicker } from "./period-pickers";
import { DaysTable, EmployeesTable, type DayRow, type EmployeeRow } from "./timesheet-tables";
import { EmployeeSignControls } from "./employee-sign";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { splitHours, SHIFTS } from "@/lib/timesheet-hours";
import { formatDate, formatNumber, formatTzs, todayISO } from "@/lib/utils";
import { t } from "@/i18n";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const hhmm = (v: unknown) => (v ? String(v).slice(0, 5) : "—");
const notDeleted = <T extends { deleted_at?: string | null }>(rows: T[] | null | undefined) => (rows ?? []).filter((r) => !r.deleted_at);

/** Months (index 0–11) of the year that a leave period touches. */
function monthsTouched(from: string, to: string, year: number): number[] {
  const out: number[] = [];
  const start = from.slice(0, 4) < String(year) ? 0 : Number(from.slice(5, 7)) - 1;
  const end = to.slice(0, 4) > String(year) ? 11 : Number(to.slice(5, 7)) - 1;
  for (let m = start; m <= end; m++) out.push(m);
  return out;
}

/** Timesheet home: every employee of the company (its active users) with their latest day, absences, and leave from the leave plan. */
export async function TimesheetEmployees({ searchParams }: { searchParams: SP }) {
  const session = await requirePermission("expenses.timesheet", "view");
  const companyId = session.company?.id ?? session.profile.company_id;
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const yearParam = Number(one(searchParams.year));
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : thisYear;
  const supabase = await createClient();

  const [{ data: sheets }, { data: plans }, { data: users }, { data: hiddenRoles }] = await Promise.all([
    supabase
      .from("timesheets")
      .select("id, employee_id, employee_name, employment_number, job_title, period_month, days:timesheet_days(work_date, day_type, deleted_at)")
      .is("deleted_at", null)
      .order("period_month", { ascending: false }),
    supabase.from("leave_plans").select("employee_id, employee_name, employment_number, position, planned_months, rows:leave_plan_rows(date_from, date_to, deleted_at)").is("deleted_at", null).eq("plan_year", year),
    // The company's active users (the company in view, also for the platform owner).
    companyId
      ? supabase.from("profiles").select("id, full_name, employment_number, job_title, roles:user_roles(role_id)").eq("is_active", true).eq("company_id", companyId).order("full_name")
      : Promise.resolve({ data: [] }),
    // Roles switched off for the timesheet in Settings, Roles.
    companyId ? supabase.from("timesheet_hidden_roles").select("role_id").eq("company_id", companyId) : Promise.resolve({ data: [] }),
  ]);
  const hidden = new Set(((hiddenRoles ?? []) as { role_id: string }[]).map((r) => r.role_id));

  type Acc = EmployeeRow & { months: Set<number>; periods: { from: string; to: string }[] };
  const people = new Map<string, Acc>();
  const get = (id: string | null, name: string) => {
    const key = id ?? `name:${name}`;
    let p = people.get(key);
    if (!p) {
      p = { id: key, href: id ? `/expenses/timesheet?employee=${id}` : null, employee: name, employment_number: "", position: "", latest: null, absent: 0, planned: "", taken: [], months: new Set(), periods: [] };
      people.set(key, p);
    }
    return p;
  };

  // Every active user of the company is an employee here, with or without a timesheet yet: a user
  // added to the company shows at once, and their days are added from their month.
  // Not listed: users whose every role is off for the timesheet (they still show once they have days).
  for (const u of (users ?? []) as { id: string; full_name: string; employment_number: string | null; job_title: string | null; roles: { role_id: string }[] | null }[]) {
    const roles = u.roles ?? [];
    if (roles.length > 0 && roles.every((r) => hidden.has(r.role_id))) continue;
    const p = get(u.id, u.full_name || t("common.unknown"));
    p.employment_number ||= u.employment_number ?? "";
    p.position ||= u.job_title ?? "";
  }

  // Newest timesheet first, so the employee details come from the latest one.
  for (const s of (sheets ?? []) as { employee_id: string | null; employee_name: string; employment_number: string | null; job_title: string | null; days: { work_date: string; day_type: string; deleted_at: string | null }[] | null }[]) {
    const p = get(s.employee_id, s.employee_name);
    p.employment_number ||= s.employment_number ?? "";
    p.position ||= s.job_title ?? "";
    for (const d of notDeleted(s.days)) {
      if (!p.latest || d.work_date > p.latest) p.latest = d.work_date;
      if (d.day_type === "absent" && d.work_date.startsWith(String(year))) p.absent++;
    }
  }
  for (const lp of (plans ?? []) as { employee_id: string | null; employee_name: string; employment_number: string | null; position: string | null; planned_months: string[] | null; rows: { date_from: string; date_to: string; deleted_at: string | null }[] | null }[]) {
    const p = get(lp.employee_id, lp.employee_name);
    p.employment_number ||= lp.employment_number ?? "";
    p.position ||= lp.position ?? "";
    // Planned leave: the months set on the plan (else the months its leave dates fall in).
    const set = (lp.planned_months ?? []).map(Number).filter((m) => m >= 1 && m <= 12);
    for (const m of set) p.months.add(m - 1);
    for (const r of notDeleted(lp.rows)) {
      if (!set.length) for (const m of monthsTouched(r.date_from, r.date_to, year)) p.months.add(m);
      p.periods.push({ from: r.date_from, to: r.date_to });
    }
  }

  const rows: EmployeeRow[] = [...people.values()]
    .map(({ months, periods, ...p }) => ({
      ...p,
      planned: [...months].sort((a, b) => a - b).map((m) => MONTHS[m]).join(", "),
      // Leave taken: the planned periods that have started.
      taken: periods
        .filter((x) => x.from <= today)
        .sort((a, b) => a.from.localeCompare(b.from))
        .map((x) => (x.from === x.to ? formatDate(x.from) : `${formatDate(x.from)} – ${formatDate(x.to)}`)),
    }))
    .sort((a, b) => a.employee.localeCompare(b.employee));

  const years = Array.from({ length: 7 }, (_, i) => thisYear + 1 - i);
  return (
    <>
      <PageHeader title={t("expenses.timesheet.title")} description={t("timesheet.home_description", { year })} />
      <ViewAllMenu items={[{ href: "/expenses/timesheet?employee=all", label: t("expenses.timesheet.title") }]} />
      <YearPicker year={year} years={years} />
      <EmployeesTable rows={rows} />
    </>
  );
}

type Tile = { label: string; value: string; lines?: string[] };

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="page-card p-4">
          <span className="block text-sm text-muted-foreground">{tile.label}</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{tile.value}</span>
          {tile.lines?.map((l) => (
            <span key={l} className="mt-0.5 block text-xs leading-4 text-muted-foreground">
              {l}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

type Sig = { name?: string | null; image?: string | null; signed_at?: string | null; via?: string | null } | null;
type Sheet = RequestLike & {
  employee_name: string;
  employment_number: string | null;
  employer: string | null;
  job_title: string | null;
  department: string | null;
  coordinator_name: string | null;
  employee_signature: Sig;
  sent_to_employee_at: string | null;
};

/** One signature of the month: who, as what, when and their drawn signature, or that it is waiting. */
function SignatureBlock({ title, name, position, date, image, note }: { title: string; name?: string | null; position?: string | null; date?: string | null; image?: string | null; note?: string | null }) {
  const signed = !!date;
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-4 ${signed ? "border-success/40 bg-success-bg/40" : "border-dashed"}`}>
      <span className="flex items-center gap-2 text-sm font-semibold">
        {signed ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />}
        {title}
      </span>
      <div className="flex min-h-16 items-center justify-center rounded-lg bg-white px-2">
        {signed && image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a drawn signature (data URL)
          <img src={image} alt={t("timesheet.signature_of", { name: name ?? title })} className="max-h-14 w-auto" />
        ) : (
          <span className="text-xs text-neutral-500">{signed ? t("timesheet.signed_without_drawing") : t("timesheet.not_signed_yet")}</span>
        )}
      </div>
      <dl className="space-y-0.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t("timesheet.sig_name")}</dt>
          <dd className="text-right font-medium">{name || "—"}</dd>
        </div>
        {position ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("timesheet.sig_position")}</dt>
            <dd className="text-right">{position}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t("timesheet.sig_date")}</dt>
          <dd className="text-right tabular-nums">{date ? formatDate(date, true) : "—"}</dd>
        </div>
      </dl>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/**
 * One employee's month, the only place for it: totals, the employee's details, the days (added and
 * changed here), then the decision with every signature: the employee (by the link sent on the
 * month's last day, or here), the fleet manager, then the HOD.
 */
export async function TimesheetEmployeeMonth({ employeeId, searchParams }: { employeeId: string; searchParams: SP }) {
  await requirePermission("expenses.timesheet", "view");
  const today = todayISO();
  const monthParam = one(searchParams.month);
  const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const supabase = await createClient();

  const valid = /^[0-9a-f-]{36}$/i.test(employeeId);
  const [{ data: person }, { data: days }, { data: sheetData }] = valid
    ? await Promise.all([
        supabase.from("profiles").select("full_name, employment_number, job_title, department, employer, company:companies(name)").eq("id", employeeId).maybeSingle(),
        supabase
          .from("timesheet_days")
          .select("id, timesheet_id, work_date, day_type, shift, time_in, time_out, break_from, break_to, total_hours, overtime_hours, special_overtime_hours, allowance_tzs, timesheet:timesheets!inner(employee_id, deleted_at)")
          .eq("timesheet.employee_id", employeeId)
          .is("timesheet.deleted_at", null)
          .is("deleted_at", null)
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date"),
        supabase.from("timesheets").select("*").eq("employee_id", employeeId).eq("period_month", from).is("deleted_at", null).maybeSingle(),
      ])
    : [{ data: null }, { data: [] }, { data: null }];

  type Day = { id: string; timesheet_id: string; work_date: string; day_type: string; shift: string; time_in: string | null; time_out: string | null; break_from: string | null; break_to: string | null; total_hours: number; overtime_hours: number; special_overtime_hours: number; allowance_tzs: number };
  const list = (days ?? []) as unknown as Day[];
  const sheet = sheetData as Sheet | null;
  const p = person as { full_name: string; employment_number: string | null; job_title: string | null; department: string | null; employer: string | null; company: { name: string } | null } | null;
  const name = p?.full_name ?? sheet?.employee_name ?? t("common.unknown");

  const txt = (v: unknown) => (v === null || v === undefined || Number(v) === 0 ? "" : String(v));
  const rows: DayRow[] = list.map((d) => {
    const split = splitHours(d);
    return {
      id: d.id,
      timesheet_id: d.timesheet_id,
      work_date: d.work_date,
      day_type: d.day_type,
      shift: d.shift,
      time_in: hhmm(d.time_in),
      time_out: hhmm(d.time_out),
      total: n(d.total_hours) || split.total,
      day_time: split.day,
      night_time: split.night,
      overtime: n(d.overtime_hours),
      special: n(d.special_overtime_hours),
      allowance: n(d.allowance_tzs),
      values: {
        work_date: d.work_date,
        day_type: d.day_type,
        shift: d.shift,
        time_in: d.time_in ? String(d.time_in).slice(0, 5) : "",
        break_from: d.break_from ? String(d.break_from).slice(0, 5) : "",
        break_to: d.break_to ? String(d.break_to).slice(0, 5) : "",
        time_out: d.time_out ? String(d.time_out).slice(0, 5) : "",
        overtime_hours: txt(d.overtime_hours),
        special_overtime_hours: txt(d.special_overtime_hours),
        allowance_tzs: txt(d.allowance_tzs),
      },
    };
  });

  const worked = rows.filter((r) => r.total > 0);
  const sum = (pick: (r: DayRow) => number, of: DayRow[] = rows) => of.reduce((s, r) => s + pick(r), 0);
  const byShift = Object.fromEntries(SHIFTS.map((s) => [s, worked.filter((r) => r.shift === s)])) as Record<(typeof SHIFTS)[number], DayRow[]>;
  const h = (v: number) => `${formatNumber(v, 2)} h`;
  const absent = rows.filter((r) => r.day_type === "absent").length;

  const tiles: Tile[] = [
    { label: t("timesheet.tile.records"), value: formatNumber(rows.length), lines: [t("timesheet.tile.worked_absent", { worked: worked.length, absent })] },
    {
      label: t("timesheet.tile.working_hours"),
      value: h(sum((r) => r.total)),
      lines: [
        SHIFTS.map((s) => `${t(`expenses.timesheet.shift.${s}`)} ${formatNumber(sum((r) => r.total, byShift[s]), 2)} h`).join(" · "),
        t("timesheet.tile.day_night_time", { day: formatNumber(sum((r) => r.day_time), 2), night: formatNumber(sum((r) => r.night_time), 2) }),
      ],
    },
    { label: t("timesheet.tile.overtime"), value: h(sum((r) => r.overtime)) },
    { label: t("timesheet.tile.special_overtime"), value: h(sum((r) => r.special)) },
    { label: t("timesheet.tile.shifts"), value: formatNumber(worked.length), lines: [SHIFTS.map((s) => `${t(`expenses.timesheet.shift.${s}`)} ${byShift[s].length}`).join(" · ")] },
    { label: t("timesheet.tile.allowance"), value: formatTzs(sum((r) => r.allowance)) },
  ];

  const monthLabel = `${LONG_MONTHS[m - 1]} ${y}`;
  const details: [string, string][] = [
    [t("expenses.timesheet.employee_name"), name],
    [t("expenses.timesheet.employment_number"), sheet?.employment_number ?? p?.employment_number ?? ""],
    [t("expenses.timesheet.employer"), sheet?.employer ?? p?.employer ?? p?.company?.name ?? ""],
    [t("expenses.timesheet.job_title"), sheet?.job_title ?? p?.job_title ?? ""],
    [t("expenses.timesheet.department"), sheet?.department ?? p?.department ?? ""],
  ];
  const editable = valid && (!sheet || sheet.status === "draft" || sheet.status === "rejected");

  return (
    <>
      <RecordTitle title={`${name} ${monthLabel}`} />
      <PageHeader title={name} description={monthLabel} />
      <ViewAllMenu items={[{ href: "/expenses/timesheet?employee=all", label: t("expenses.timesheet.title") }]} />
      <MonthPicker month={month} />
      <Tiles tiles={tiles} />
      <section className="page-card p-4 md:p-5" aria-label={t("timesheet.employee_details")}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0 lg:border-l lg:pl-4 lg:first:border-l-0 lg:first:pl-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 truncate font-medium" title={value || undefined}>
                {value || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <DaysTable rows={rows} employeeId={employeeId} month={month} editable={editable} signature={sheet && !editable ? sheet.employee_signature : null} />
      {sheet ? (
        <TimesheetDecision sheet={sheet} employee={name} lastDay={to} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("timesheet.decision_after_days", { date: formatDate(to) })}</p>
      )}
    </>
  );
}

/** Below the days: every signature of the month, and the decision (fleet manager, then HOD). */
async function TimesheetDecision({ sheet, employee, lastDay }: { sheet: Sheet; employee: string; lastDay: string }) {
  const supabase = await createClient();
  const [{ data: offs }, { data: link }, { data: approver }] = await Promise.all([
    supabase.from("approval_signoffs").select("step, signer_name, signer_position, signature, created_at").eq("table_name", "timesheets").eq("record_id", sheet.id).order("created_at"),
    supabase.from("driver_confirmations").select("created_at, expires_at, confirmed_at").eq("table_name", "timesheets").eq("record_id", sheet.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sheet.approved_by ? supabase.from("profiles").select("full_name, job_title").eq("id", sheet.approved_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  type Off = StepSignoff & { signer_position: string | null; signature: Sig };
  // Only the sign-offs of this round (a rejected month starts again).
  const since = sheet.submitted_at ?? "";
  const signoffs = ((offs ?? []) as Off[]).filter((o) => !since || o.created_at >= since);
  const fm = signoffs.filter((o) => o.step === "approval").pop();
  const open = sheet.status === "draft" || sheet.status === "rejected";
  const decided = sheet.status === "approved" || sheet.status === "completed";
  const appr = approver as { full_name: string; job_title: string | null } | null;
  const emp = open ? null : sheet.employee_signature;
  const l = link as { created_at: string; expires_at: string; confirmed_at: string | null } | null;
  const recorded = sheet.coordinator_name ? t("timesheet.recorded_by", { name: sheet.coordinator_name }) : null;

  return (
    <section className="space-y-3" aria-labelledby="timesheet-decision">
      <h2 id="timesheet-decision" className="text-lg font-semibold">
        {t("timesheet.decision")}
      </h2>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-3 sm:grid-cols-3 lg:col-span-2">
          <SignatureBlock
            title={t("timesheet.sig_employee")}
            name={emp?.name ?? employee}
            date={emp?.signed_at ?? null}
            image={emp?.image}
            note={emp ? (emp.via === "device" ? t("timesheet.signed_on_device") : t("timesheet.signed_by_link")) : recorded}
          />
          <SignatureBlock title={t("timesheet.sig_fleet_manager")} name={fm?.signer_name} position={fm?.signer_position} date={fm?.created_at ?? null} image={fm?.signature?.image} />
          <SignatureBlock
            title={t("timesheet.sig_hod")}
            name={decided ? (appr?.full_name ?? sheet.approver_name) : null}
            position={decided ? appr?.job_title : null}
            date={decided ? sheet.approved_at : null}
            image={decided ? (sheet.approver_signature as Sig)?.image : null}
          />
        </div>
        <ApprovalPanel table="timesheets" resource="expenses.timesheet" request={sheet} approverName={appr?.full_name ?? null} revalidate={["/expenses/timesheet"]} signoffs={signoffs} canSubmit={false}>
          {open ? (
            <EmployeeSignControls
              timesheetId={sheet.id}
              employee={employee}
              sentAt={sheet.sent_to_employee_at}
              linkExpires={l && !l.confirmed_at ? l.expires_at : null}
              autoSendOn={lastDay}
              rejected={sheet.status === "rejected"}
            />
          ) : null}
        </ApprovalPanel>
      </div>
    </section>
  );
}
