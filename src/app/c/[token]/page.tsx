import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Clock, Link2Off } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatNumber } from "@/lib/utils";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Confirm your request", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Info = {
  state: "open" | "done" | "expired" | "not_found";
  table?: "fuel_requests" | "timesheets";
  record?: Record<string, unknown>;
  days?: TsDay[];
  driver?: string;
  requested_by?: string | null;
  vehicle?: string | null;
  company?: string;
  confirmed_at?: string | null;
};

/** A driver confirms and signs a fuel or maintenance request someone made for them (from the email or SMS link). */
export default async function DriverConfirmPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const valid = /^[0-9a-f]{32}$/.test(token);
  const { data } = valid ? await createAdminClient().rpc("driver_confirmation_open", { p_token: token }) : { data: null };
  const info = (data ?? { state: "not_found" }) as Info;

  if (info.state === "not_found") {
    return (
      <Shell>
        <Notice icon={Link2Off} title="This link is not valid" text="Check that you opened the whole link from the email or SMS." />
      </Shell>
    );
  }

  const r = info.record ?? {};
  if (info.table === "timesheets") return <TimesheetConfirm token={token} info={info} />;
  const fuel = info.table === "fuel_requests";
  const rows: [string, string][] = fuel
    ? [
        ["Vehicle", info.vehicle ?? "—"],
        ["Date", formatDate(r.request_date as string)],
        ["Previous odometer", r.previous_odometer != null ? `${formatNumber(Number(r.previous_odometer))} km` : "—"],
        ["Current odometer", r.current_odometer != null ? `${formatNumber(Number(r.current_odometer))} km` : "—"],
        ["Fuel required", r.fuel_required_l != null ? `${formatNumber(Number(r.fuel_required_l), 1)} L` : "—"],
      ]
    : [
        ["Vehicle", info.vehicle ?? "—"],
        ["Date", formatDate(r.request_date as string)],
        ["Odometer", r.odometer_km != null ? `${formatNumber(Number(r.odometer_km))} km` : "—"],
        ["Reason", String(r.reason ?? "—")],
        ["Faults", Array.isArray(r.faults) ? (r.faults as string[]).join(", ") : "—"],
        ["Details", String(r.fault_details ?? "") || "—"],
      ];

  return (
    <Shell company={info.company}>
      <h1 className="text-xl font-semibold">{fuel ? "Confirm your fuel request" : "Confirm your maintenance request"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {info.requested_by ?? "Your coordinator"} made this request for you, {info.driver}. Check it, then confirm and sign. It cannot be approved until you do.
      </p>
      <dl className="mt-4 divide-y rounded-lg border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[40%_60%] gap-2 px-3 py-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        {info.state === "done" ? (
          <Notice icon={CheckCircle2} title="Already confirmed" text={`You confirmed this request on ${formatDate(info.confirmed_at ?? null, true)}.`} />
        ) : info.state === "expired" ? (
          <Notice icon={Clock} title="This link has expired" text="Ask your coordinator to send the request again." />
        ) : (
          <ConfirmForm token={token} driverName={info.driver ?? ""} />
        )}
      </div>
    </Shell>
  );
}

type TsDay = { work_date: string; day_type: string; shift: string; time_in: string | null; time_out: string | null; total_hours: number; overtime_hours: number; special_overtime_hours: number; allowance_tzs: number };
const DAY_TYPE: Record<string, string> = { work: "Work", rest: "Rest day", leave: "Leave", public_holiday: "Public holiday", sick: "Sick", absent: "Absent" };
const SHIFT: Record<string, string> = { day: "Day", noon: "Noon", night: "Night" };
const hrs = (v: number) => (Number(v) ? formatNumber(Number(v), 2) : "—");

/** The employee checks the days of their month and signs it (then it goes to the fleet manager and the HOD). */
function TimesheetConfirm({ token, info }: { token: string; info: Info }) {
  const r = info.record ?? {};
  const days = info.days ?? [];
  const month = r.period_month ? new Date(`${r.period_month}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
  const total = (k: keyof TsDay) => days.reduce((s, d) => s + (Number(d[k]) || 0), 0);
  const totals: [string, string][] = [
    ["Days recorded", formatNumber(days.length)],
    ["Hours worked", `${formatNumber(total("total_hours"), 2)} h`],
    ["Normal overtime", `${formatNumber(total("overtime_hours"), 2)} h`],
    ["Special overtime", `${formatNumber(total("special_overtime_hours"), 2)} h`],
    ["Allowance", `TZS ${formatNumber(total("allowance_tzs"))}`],
  ];
  return (
    <Shell company={info.company}>
      <h1 className="text-xl font-semibold">Sign your timesheet for {month}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {info.driver}, these are the days recorded for you{info.requested_by ? ` by ${info.requested_by}` : ""}. Check them, then sign. After you sign, the fleet manager and then the HOD approve it. If something is wrong, do not sign: tell your coordinator.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {totals.map(([k, v]) => (
          <div key={k} className="rounded-lg border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-136 text-sm">
          <caption className="sr-only">Days of {month}</caption>
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Date</th>
              <th scope="col" className="px-3 py-2 font-medium">Day</th>
              <th scope="col" className="px-3 py-2 font-medium">Shift</th>
              <th scope="col" className="px-3 py-2 font-medium">In – out</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Hours</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Overtime</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {days.map((d) => (
              <tr key={d.work_date}>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(d.work_date)}</td>
                <td className="px-3 py-2">{DAY_TYPE[d.day_type] ?? d.day_type}</td>
                <td className="px-3 py-2">{Number(d.total_hours) ? (SHIFT[d.shift] ?? d.shift) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{d.time_in && d.time_out ? `${d.time_in} – ${d.time_out}` : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{hrs(d.total_hours)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{hrs(Number(d.overtime_hours) + Number(d.special_overtime_hours))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5">
        {info.state === "done" ? (
          <Notice icon={CheckCircle2} title="Already signed" text={`You signed this timesheet on ${formatDate(info.confirmed_at ?? null, true)}.`} />
        ) : info.state === "expired" ? (
          <Notice icon={Clock} title="This link no longer works" text="It has expired, a newer link was sent, or the month is already signed. Use the latest email or SMS, or ask your coordinator." />
        ) : (
          <ConfirmForm token={token} driverName={info.driver ?? ""} timesheet />
        )}
      </div>
    </Shell>
  );
}

function Shell({ company, children }: { company?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-svh bg-muted/40">
      <header className="bg-[#0f3d34] text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Image src="/brand/fms-logo-white.png" alt="FMS" width={640} height={306} priority className="h-9 w-auto" />
          {company ? <span className="truncate text-sm text-white/85">{company}</span> : null}
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <section className="rounded-2xl border bg-card p-5 md:p-7">{children}</section>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          This page is personal to you. <Link href="/login" className="underline underline-offset-4">Sign in</Link> to see everything else.
        </p>
      </div>
    </main>
  );
}

function Notice({ icon: Icon, title, text }: { icon: typeof CheckCircle2; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
