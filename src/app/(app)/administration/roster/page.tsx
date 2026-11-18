import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/utils";
import { RosterBoard } from "./roster-board";
import { addDays, cycleStartFor, type RosterException, type RosterMember, type RosterSettings } from "./cycle";
import { t } from "@/i18n";

/** Fleet roster: the rotating block roster, one cycle (4 blocks) at a time. ?cycle=-1 / 1 moves back or forward. */
export default async function RosterPage({ searchParams }: PageProps<"/administration/roster">) {
  const session = await requirePermission("expenses.admin.roster", "view");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: settingsRow }, { data: memberRows }, { data: driverRows }] = await Promise.all([
    supabase.from("roster_settings").select("*").is("deleted_at", null).maybeSingle(),
    supabase.from("roster_members").select("id, team, driver_id, person_name, employment_id, role, start_phase, sort_order").is("deleted_at", null).eq("active", true).order("team").order("sort_order").order("person_name"),
    supabase.from("drivers").select("id, full_name, employment_number").is("deleted_at", null).eq("is_active", true).order("full_name"),
  ]);
  const s = settingsRow as Record<string, unknown> | null;
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const settings: RosterSettings = {
    id: (s?.id as string) ?? null,
    cycle_start: (s?.cycle_start as string) ?? monday,
    block_days: Number(s?.block_days ?? 7),
    day_from: String(s?.day_from ?? "06:00").slice(0, 5),
    day_to: String(s?.day_to ?? "14:00").slice(0, 5),
    noon_from: String(s?.noon_from ?? "14:00").slice(0, 5),
    noon_to: String(s?.noon_to ?? "22:00").slice(0, 5),
    night_from: String(s?.night_from ?? "22:00").slice(0, 5),
    night_to: String(s?.night_to ?? "06:00").slice(0, 5),
  };

  const offset = Math.max(-24, Math.min(24, Number(typeof sp.cycle === "string" ? sp.cycle : 0) || 0));
  const len = settings.block_days * 4;
  const start = addDays(cycleStartFor(today, settings), offset * len);
  const end = addDays(start, len - 1);

  const { data: exceptionRows } = await supabase
    .from("fleet_rosters")
    .select("id, member_id, roster_date, shift, notes")
    .not("member_id", "is", null)
    .is("deleted_at", null)
    .gte("roster_date", start)
    .lte("roster_date", end);

  return (
    <>
      <PageHeader title={t("roster.title")} description={t("roster.description")} />
      <RosterBoard
        settings={settings}
        members={(memberRows ?? []) as RosterMember[]}
        exceptions={(exceptionRows ?? []) as RosterException[]}
        drivers={((driverRows ?? []) as { id: string; full_name: string; employment_number: string | null }[]).map((d) => ({ value: d.id, label: d.full_name, employment: d.employment_number }))}
        start={start}
        offset={offset}
        today={today}
        canEdit={session.can("expenses.admin.roster", "edit") || session.can("expenses.admin.roster", "create")}
      />
    </>
  );
}
