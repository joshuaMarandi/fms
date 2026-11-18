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
  table?: "fuel_requests" | "maintenance_requests";
  record?: Record<string, unknown>;
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
