import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Clock, Link2Off } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatNumber } from "@/lib/utils";
import { GiveForm } from "./give-form";

export const metadata: Metadata = { title: "Record a payment", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Info = {
  state: "open" | "done" | "expired" | "not_found";
  kind?: "petty_cash" | "outstation";
  /** Outstation allowance: its lines and the total to pay. */
  rows?: { label: string; value: string }[];
  amount?: number | null;
  company?: string;
  requester?: string | null;
  position?: string | null;
  purpose?: string | null;
  request_date?: string | null;
  amount_requested?: number | null;
  amount_approved?: number | null;
  verified_by?: string | null;
  hod?: string | null;
  given_by?: string | null;
  given_at?: string | null;
  amount_given?: number | null;
};

const tzs = (v: number | null | undefined) => (v == null ? "—" : `TZS ${formatNumber(Number(v))}`);

/** Finance, from the email: a verified petty cash request or an approved outstation allowance to pay. Record the amount and upload the proof. */
export default async function FinanceGivePage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const valid = /^[0-9a-f]{32}$/.test(token);
  const { data } = valid ? await createAdminClient().rpc("finance_link_open", { p_token: token }) : { data: null };
  const info = (data ?? { state: "not_found" }) as Info;

  if (info.state === "not_found") {
    return (
      <Shell>
        <Notice icon={Link2Off} title="This link is not valid" text="Check that you opened the whole link from the email." />
      </Shell>
    );
  }

  const outstation = info.kind === "outstation";
  const rows: [string, string][] = outstation ? (info.rows ?? []).map((r) => [r.label, r.value || "—"]) : [
    ["Requested by", [info.requester, info.position].filter(Boolean).join(", ") || "—"],
    ["Date", formatDate(info.request_date ?? null) || "—"],
    ["Purpose", info.purpose || "—"],
    ["Amount requested", tzs(info.amount_requested)],
    ["Amount verified", tzs(info.amount_approved)],
    ["Verified by", [info.verified_by, info.hod ? `${info.hod} (HOD verification)` : null].filter(Boolean).join(", ") || "—"],
  ];

  return (
    <Shell company={info.company}>
      <h1 className="text-xl font-semibold">{outstation ? "Pay outstation allowance" : "Give petty cash"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {outstation
          ? "This outstation allowance is approved. Pay it, then record the amount paid and upload the proof of payment here. The person who recorded it is told."
          : "This petty cash request is verified. Give the money, then record the amount and upload the proof of payment here. The person who asked can then record what they spend."}
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
          <Notice icon={CheckCircle2} title="Already given" text={`${info.given_by ?? "Finance"} recorded ${tzs(info.amount_given)} on ${formatDate(info.given_at ?? null, true)}, with the proof of payment.`} />
        ) : info.state === "expired" ? (
          <Notice icon={Clock} title="This link no longer works" text="It has expired, or the request changed. Ask the fleet manager to check the request." />
        ) : (
          <GiveForm token={token} amount={Number((outstation ? info.amount : info.amount_approved) ?? 0)} />
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
          This page is personal to you. Do not forward the link.{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>{" "}
          if you have an account.
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
