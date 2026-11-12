import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, CircleDashed, Clock, Link2Off, XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Request decision", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type LinkInfo = {
  state: "open" | "done" | "expired" | "no_access" | "not_found";
  company_id?: string;
  user_id?: string;
  table?: "leave_requests" | "vehicle_requests";
  record_id?: string;
  step?: string;
  step_label?: string;
  request_label?: string;
  status?: string;
  expires_at?: string;
  summary?: { requester: string; summary: string; details: { label: string; value: string }[] } | null;
};

type Event = { step: string; action: string; actor_name: string | null; reason: string | null; via: string; created_at: string };

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

const STEP_LABEL: Record<string, string> = {
  approval: "Approval",
  hse_manager: "HSE manager sign-off",
  control_room: "Control room sign-off",
  emergency_commander: "Emergency response commander sign-off",
};

const ACTION: Record<string, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  submitted: { label: "Sent for approval", icon: CircleDashed, tone: "text-muted-foreground" },
  resubmitted: { label: "Changed and sent again", icon: CircleDashed, tone: "text-muted-foreground" },
  approved: { label: "Approved", icon: CheckCircle2, tone: "text-success" },
  rejected: { label: "Rejected", icon: XCircle, tone: "text-danger" },
};

/** Personal link from an approval email or SMS: see the request and decide it without signing in. */
export default async function ApprovalLinkPage({ params }: PageProps<"/a/[token]">) {
  const { token } = await params;
  const admin = createAdminClient();
  const valid = /^[0-9a-f]{32}$/.test(token);
  const { data } = valid ? await admin.rpc("approval_link_open", { p_token: token }) : { data: null };
  const link = (data ?? { state: "not_found" }) as LinkInfo;

  if (link.state === "not_found") {
    return (
      <Shell>
        <Notice icon={Link2Off} title="This link is not valid" text="Check that you opened the whole link from the email or SMS. If it still does not work, sign in to the system to find the request." />
      </Shell>
    );
  }

  const [{ data: company }, { data: person }, { data: events }] = await Promise.all([
    admin.from("companies").select("name").eq("id", link.company_id!).maybeSingle(),
    admin.from("profiles").select("full_name, job_title").eq("id", link.user_id!).maybeSingle(),
    admin.from("approval_events").select("step, action, actor_name, reason, via, created_at").eq("table_name", link.table!).eq("record_id", link.record_id!).order("created_at"),
  ]);
  const companyName = (company as { name: string } | null)?.name ?? "";
  const me = (person ?? { full_name: "", job_title: null }) as { full_name: string; job_title: string | null };

  let drivers: { value: string; label: string }[] = [];
  let vehicles: { value: string; label: string }[] = [];
  const needsAssignment = link.state === "open" && link.table === "vehicle_requests" && link.step === "approval";
  if (needsAssignment) {
    const [{ data: d }, { data: v }] = await Promise.all([
      admin.from("drivers").select("id, full_name, phone").eq("company_id", link.company_id!).is("deleted_at", null).eq("is_active", true).order("full_name"),
      admin.from("vehicles").select("id, registration, make, model").eq("company_id", link.company_id!).is("deleted_at", null).eq("status", "in_service").order("registration"),
    ]);
    drivers = ((d ?? []) as { id: string; full_name: string; phone: string | null }[]).map((x) => ({ value: x.id, label: `${x.full_name}${x.phone ? ` (${x.phone})` : ""}` }));
    vehicles = ((v ?? []) as { id: string; registration: string; make: string; model: string }[]).map((x) => ({ value: x.id, label: `${x.registration} · ${x.make} ${x.model}`.trim() }));
  }

  const history = (events ?? []) as Event[];

  return (
    <Shell company={companyName}>
      <div className="space-y-5">
        <div>
          <p className="text-sm text-muted-foreground">{cap(link.request_label)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{link.summary?.summary ?? cap(link.request_label)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step: <span className="font-medium text-foreground">{link.step_label}</span>
          </p>
        </div>

        {link.summary?.details?.length ? (
          <dl className="divide-y rounded-lg border text-sm">
            {link.summary.details
              .filter((d) => d.value)
              .map((d) => (
                <div key={d.label} className="grid grid-cols-[40%_1fr] gap-3 px-3 py-2.5">
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="font-medium">{d.value}</dd>
                </div>
              ))}
          </dl>
        ) : null}

        {history.length ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
            <ol className="relative space-y-3 border-l pl-5">
              {history.map((e, i) => {
                const a = ACTION[e.action] ?? ACTION.submitted!;
                const Icon = a.icon;
                return (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[27px] top-0.5 flex size-4 items-center justify-center rounded-full bg-card">
                      <Icon className={`size-4 ${a.tone}`} aria-hidden="true" />
                    </span>
                    <span className="font-medium">{a.label}</span>
                    {e.action !== "submitted" && e.action !== "resubmitted" ? <span className="text-muted-foreground"> · {STEP_LABEL[e.step] ?? e.step}</span> : null}
                    <span className="block text-xs text-muted-foreground">
                      {[e.actor_name, formatDate(e.created_at, true), e.via === "link" ? "from the email or SMS link" : null].filter(Boolean).join(" · ")}
                    </span>
                    {e.reason ? <span className="mt-1 block rounded-md bg-danger-bg px-2 py-1 text-xs text-danger">{e.reason}</span> : null}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {link.state === "open" ? (
          <DecisionForm
            token={token}
            table={link.table!}
            step={link.step!}
            personName={me.full_name}
            personPosition={me.job_title ?? ""}
            drivers={drivers}
            vehicles={vehicles}
            expiresAt={link.expires_at ? formatDate(link.expires_at) : null}
          />
        ) : link.state === "expired" ? (
          <Notice icon={Clock} title="This link has expired" text="Sign in to the system to decide the request." />
        ) : link.state === "no_access" ? (
          <Notice icon={Link2Off} title="You can no longer decide this request" text="Your role changed since the link was sent. Ask your administrator if this is wrong." />
        ) : (
          <Notice
            icon={CheckCircle2}
            title="Nothing more to do here"
            text={
              link.status === "approved" || link.status === "completed"
                ? "This step is already decided. The request moved on and the next person was told."
                : link.status === "rejected"
                  ? "This request was rejected and is back with the person who made it."
                  : "This step was already decided, or the request changed since this link was sent."
            }
          />
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
