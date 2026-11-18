import { CheckCircle2, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * On a fuel or maintenance request made for a driver by someone else: whether the driver has
 * confirmed and signed it (their signature, name and time are the proof), or that it is waiting.
 */
export async function DriverConfirmationCard({ table, id }: { table: string; id: string }) {
  if (table !== "fuel_requests" && table !== "maintenance_requests") return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("driver_confirmations")
    .select("confirmed_at, signature, created_at, driver:drivers(full_name)")
    .eq("table_name", table)
    .eq("record_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const c = data as { confirmed_at: string | null; signature: { name?: string; image?: string } | null; created_at: string; driver: { full_name: string } | null } | null;
  if (!c) return null;
  const driver = c.driver?.full_name ?? t("common.unknown");
  if (!c.confirmed_at) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm">
        <Clock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="font-semibold text-warning">{t("confirm.waiting_title", { driver })}</p>
          <p className="mt-0.5 text-muted-foreground">{t("confirm.waiting_text", { date: formatDate(c.created_at, true) })}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success-bg p-4 text-sm">
      <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
      <div className="mr-auto">
        <p className="font-semibold text-success">{t("confirm.done_title", { driver })}</p>
        <p className="mt-0.5 text-muted-foreground">{t("confirm.done_text", { name: c.signature?.name ?? driver, date: formatDate(c.confirmed_at, true) })}</p>
      </div>
      {c.signature?.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- the driver's drawn signature
        <img src={c.signature.image} alt={t("confirm.signature_alt", { driver })} className="h-12 w-auto rounded bg-white px-2" />
      ) : null}
    </div>
  );
}
