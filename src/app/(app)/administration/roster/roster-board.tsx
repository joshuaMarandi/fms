"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Settings2, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/patterns/search-select";
import { useSession } from "@/components/permissions/provider";
import { deleteRecord, saveRecord } from "@/lib/data/records";
import { exportExcel } from "@/lib/export";
import { cn, formatDate } from "@/lib/utils";
import { addDays, cycleShift, PATTERN, type RosterException, type RosterMember, type RosterSettings, type Shift } from "./cycle";
import { t } from "@/i18n";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHIFT_STYLE: Record<Shift, string> = {
  day: "bg-[#fdf1d8] text-[#7a4c05]",
  noon: "bg-[#fde3d4] text-[#8a3b12]",
  night: "bg-[#dfe7f7] text-[#24407a]",
  off: "bg-[#e2f1e3] text-[#24613a]",
  leave: "bg-[#e9e4f4] text-[#4b3680]",
  sick: "bg-[#f9e1de] text-[#8a1c12]",
  standby: "bg-[#e8e7e1] text-[#3f4a46]",
};
const CHOICES: Shift[] = ["day", "noon", "night", "off", "leave", "sick", "standby"];
const PATHS = ["/administration/roster"];

type DriverOption = { value: string; label: string; employment: string | null };

/**
 * The rotating block roster on one screen: people by team down the side, the days of one cycle
 * across, coloured by shift, and the number on each shift per day at the bottom. Clicking a day
 * changes it for that person only (an exception); the cycle carries on as before.
 */
export function RosterBoard({
  settings,
  members,
  exceptions,
  drivers,
  start,
  offset,
  today,
  canEdit,
}: {
  settings: RosterSettings;
  members: RosterMember[];
  exceptions: RosterException[];
  drivers: DriverOption[];
  start: string;
  offset: number;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const session = useSession();
  const len = settings.block_days * 4;
  const days = React.useMemo(() => Array.from({ length: len }, (_, i) => addDays(start, i)), [start, len]);
  const exceptionOf = React.useMemo(() => new Map(exceptions.map((e) => [`${e.member_id}:${e.roster_date}`, e])), [exceptions]);
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const shiftOf = (m: RosterMember, date: string): { shift: Shift; changed: RosterException | null } => {
    const ex = exceptionOf.get(`${m.id}:${date}`) ?? null;
    return { shift: ex ? ex.shift : cycleShift(m, date, settings), changed: ex };
  };

  // Teams in order, members in order within a team.
  const teams = React.useMemo(() => {
    const map = new Map<string, RosterMember[]>();
    for (const m of members) map.set(m.team, [...(map.get(m.team) ?? []), m]);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [members]);

  const counts = (date: string) => {
    const c: Record<string, number> = { day: 0, noon: 0, night: 0, off: 0, away: 0 };
    for (const m of members) {
      const s = shiftOf(m, date).shift;
      if (s === "day" || s === "noon" || s === "night" || s === "off") c[s] = (c[s] ?? 0) + 1;
      else c.away = (c.away ?? 0) + 1;
    }
    return c;
  };

  async function setShift(m: RosterMember, date: string, shift: Shift | null) {
    const ex = exceptionOf.get(`${m.id}:${date}`);
    const res =
      shift === null || shift === cycleShift(m, date, settings)
        ? ex
          ? await deleteRecord("fleet_rosters", ex.id, PATHS)
          : { ok: true as const, data: null }
        : await saveRecord({ table: "fleet_rosters", id: ex?.id ?? null, values: { member_id: m.id, driver_id: m.driver_id, roster_date: date, shift }, revalidate: PATHS });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  async function exportSheet() {
    const cols = [
      { key: "team", header: t("roster.team") },
      { key: "employment_id", header: t("roster.employment_id") },
      { key: "name", header: t("roster.name") },
      ...days.map((d, i) => ({ key: d, header: `D${i + 1} ${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}` })),
    ];
    const rows: Record<string, unknown>[] = [];
    for (const [, list] of teams) {
      for (const m of list) {
        const r: Record<string, unknown> = { team: m.team, employment_id: m.employment_id ?? "", name: m.person_name };
        for (const d of days) r[d] = t(`roster.shift.${shiftOf(m, d).shift}`);
        rows.push(r);
      }
    }
    for (const key of ["day", "noon", "night", "off"] as const) {
      const r: Record<string, unknown> = { team: "", employment_id: "", name: t(`roster.total.${key}`) };
      for (const d of days) r[d] = counts(d)[key];
      rows.push(r);
    }
    await exportExcel(cols, rows, `fleet-roster-${start}`, `${t("roster.title")} ${formatDate(start)} – ${formatDate(days[days.length - 1]!)}`, { brand: session.brand, printedBy: session.fullName });
  }

  const weeks = Array.from({ length: 4 }, (_, w) => days.slice(w * settings.block_days, (w + 1) * settings.block_days));

  return (
    <div className="space-y-4">
      {/* Shifts and cycle, with navigation and actions */}
      <div className="page-card flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" className="size-10" aria-label={t("roster.previous")}>
            <Link href={`/administration/roster?cycle=${offset - 1}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <div className="min-w-[210px] px-2 text-center">
            <p className="text-sm font-semibold">
              {formatDate(start)} – {formatDate(days[days.length - 1]!)}
            </p>
            <p className="text-xs text-muted-foreground">{offset === 0 ? t("roster.this_cycle") : t("roster.cycle_offset", { n: offset > 0 ? `+${offset}` : String(offset) })}</p>
          </div>
          <Button asChild variant="outline" size="icon" className="size-10" aria-label={t("roster.next")}>
            <Link href={`/administration/roster?cycle=${offset + 1}`}>
              <ChevronRight />
            </Link>
          </Button>
          {offset !== 0 ? (
            <Button asChild variant="ghost" className="h-10">
              <Link href="/administration/roster">{t("roster.today")}</Link>
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("roster.shifts_line", { day: `${settings.day_from}–${settings.day_to}`, noon: `${settings.noon_from}–${settings.noon_to}`, night: `${settings.night_from}–${settings.night_to}`, block: settings.block_days })}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={exportSheet} disabled={members.length === 0}>
            <Download /> {t("roster.export")}
          </Button>
          {canEdit ? (
            <>
              <Button type="button" variant="outline" className="h-10" onClick={() => setSettingsOpen(true)}>
                <Settings2 /> {t("roster.settings")}
              </Button>
              <Button type="button" className="h-10" onClick={() => setMembersOpen(true)}>
                <Users /> {t("roster.people")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {members.length === 0 ? (
        <div className="page-card p-8 text-center">
          <p className="font-medium">{t("roster.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("roster.empty_hint")}</p>
          {canEdit ? (
            <Button type="button" className="mt-4 h-10" onClick={() => setMembersOpen(true)}>
              <UserPlus /> {t("roster.add_person")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="page-card overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th colSpan={3} className="sticky left-0 z-20 border-b border-r bg-[#0f3d34] px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-white uppercase">
                  {t("roster.people_heading")}
                </th>
                {weeks.map((w, i) => (
                  <th key={i} colSpan={w.length} className="border-b border-l bg-muted/60 px-2 py-2 text-center text-[11px] font-semibold tracking-wide uppercase">
                    {t("roster.week", { n: i + 1, from: i * settings.block_days + 1, to: (i + 1) * settings.block_days })}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-20 w-[72px] border-b bg-[#0f5c4d] px-2 py-1.5 text-left font-semibold text-white">{t("roster.team")}</th>
                <th className="sticky left-[72px] z-20 w-[84px] border-b bg-[#0f5c4d] px-2 py-1.5 text-left font-semibold text-white">{t("roster.employment_id")}</th>
                <th className="sticky left-[156px] z-20 min-w-[170px] border-b border-r bg-[#0f5c4d] px-2 py-1.5 text-left font-semibold text-white">{t("roster.name")}</th>
                {days.map((d, i) => (
                  <th key={d} className={cn("min-w-[44px] border-b px-1 py-1 text-center font-semibold", i % settings.block_days === 0 && "border-l", d === today ? "bg-[#d98b1f] text-white" : "bg-muted/40")} title={formatDate(d)}>
                    <span className="block">D{i + 1}</span>
                    <span className="block font-normal">{WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                    <span className={cn("block text-[10px] font-normal", d === today ? "text-white/90" : "text-muted-foreground")}>{d.slice(8, 10)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map(([team, list]) =>
                list.map((m, j) => (
                  <tr key={m.id} className={cn(j === list.length - 1 && "border-b-2 border-[#0f3d34]/20")}>
                    <td className="sticky left-0 z-10 w-[72px] border-b bg-card px-2 py-1 font-medium">{j === 0 ? team : ""}</td>
                    <td className="sticky left-[72px] z-10 w-[84px] border-b bg-card px-2 py-1 tabular-nums text-muted-foreground">{m.employment_id ?? "—"}</td>
                    <td className="sticky left-[156px] z-10 min-w-[170px] border-b border-r bg-card px-2 py-1 font-medium">
                      {m.person_name}
                      {m.role === "coordinator" ? <span className="ml-1 text-[10px] text-muted-foreground">({t("roster.coordinator")})</span> : null}
                    </td>
                    {days.map((d, i) => {
                      const { shift, changed } = shiftOf(m, d);
                      const cell = (
                        <span className={cn("relative flex h-7 items-center justify-center rounded text-[11px] font-semibold", SHIFT_STYLE[shift], changed && "ring-2 ring-[#d98b1f] ring-inset")}>
                          {t(`roster.shift.${shift}`)}
                          {changed ? <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-[#d98b1f]" /> : null}
                        </span>
                      );
                      return (
                        <td key={d} className={cn("border-b px-0.5 py-0.5", i % settings.block_days === 0 && "border-l", d === today && "bg-[#d98b1f]/10")}>
                          {canEdit ? (
                            <DayPicker current={shift} cycle={cycleShift(m, d, settings)} changed={!!changed} onPick={(s) => setShift(m, d, s)} label={`${m.person_name}, ${formatDate(d)}`}>
                              {cell}
                            </DayPicker>
                          ) : (
                            cell
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
            </tbody>
            <tfoot>
              {(["day", "noon", "night", "off"] as const).map((key) => (
                <tr key={key} className={SHIFT_STYLE[key]}>
                  <td colSpan={3} className="sticky left-0 z-10 border-b border-r bg-inherit px-2 py-1.5 font-semibold">
                    {t(`roster.total.${key}`)}
                  </td>
                  {days.map((d, i) => (
                    <td key={d} className={cn("border-b px-1 py-1.5 text-center font-semibold tabular-nums", i % settings.block_days === 0 && "border-l")}>
                      {counts(d)[key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          </table>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t("roster.legend")}</p>
        </div>
      )}

      {canEdit ? <MembersDialog open={membersOpen} onOpenChange={setMembersOpen} members={members} drivers={drivers} /> : null}
      {canEdit ? <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} /> : null}
    </div>
  );
}

function DayPicker({ current, cycle, changed, onPick, label, children }: { current: Shift; cycle: Shift; changed: boolean; onPick: (s: Shift | null) => void; label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="block w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`${label}: ${t(`roster.shift.${current}`)}`}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="center">
        <p className="px-1 pb-2 text-xs text-muted-foreground">{label}</p>
        <div className="grid grid-cols-2 gap-1">
          {CHOICES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(s);
              }}
              className={cn("h-8 rounded text-xs font-semibold", SHIFT_STYLE[s], s === current && "ring-2 ring-[#0f3d34]")}
            >
              {t(`roster.shift.${s}`)}
            </button>
          ))}
        </div>
        {changed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => {
              setOpen(false);
              onPick(null);
            }}
          >
            {t("roster.back_to_cycle", { shift: t(`roster.shift.${cycle}`) })}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function MembersDialog({ open, onOpenChange, members, drivers }: { open: boolean; onOpenChange: (o: boolean) => void; members: RosterMember[]; drivers: DriverOption[] }) {
  const router = useRouter();
  const teams = [...new Set(members.map((m) => m.team))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const empty = { team: teams[0] ?? "Team 1", driver_id: "", person_name: "", employment_id: "", role: "driver" as RosterMember["role"], start_phase: "0" };
  const [draft, setDraft] = React.useState(empty);
  const [busy, setBusy] = React.useState(false);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  // People in the same team start the cycle on the same week.
  const phaseForTeam = (team: string) => String(members.find((m) => m.team === team)?.start_phase ?? draft.start_phase);

  async function add() {
    if (!draft.driver_id && !draft.person_name.trim()) {
      toast.error(t("roster.name_required"));
      return;
    }
    setBusy(true);
    const res = await saveRecord({
      table: "roster_members",
      values: {
        team: draft.team.trim() || "Team 1",
        driver_id: draft.driver_id || null,
        person_name: draft.person_name.trim() || (drivers.find((d) => d.value === draft.driver_id)?.label ?? ""),
        employment_id: draft.employment_id.trim() || null,
        role: draft.role,
        start_phase: Number(draft.start_phase),
        sort_order: members.filter((m) => m.team === draft.team).length,
      },
      revalidate: PATHS,
    });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("common.saved"));
      setDraft({ ...empty, team: draft.team, start_phase: draft.start_phase });
      router.refresh();
    }
  }

  async function remove(m: RosterMember) {
    const res = await deleteRecord("roster_members", m.id, PATHS);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  async function move(m: RosterMember, patch: Partial<Pick<RosterMember, "team" | "start_phase">>) {
    const res = await saveRecord({ table: "roster_members", id: m.id, values: patch, revalidate: PATHS });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[96vw] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("roster.people")}</DialogTitle>
          <DialogDescription>{t("roster.people_hint")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("roster.driver")}</Label>
            <SearchSelect
              value={draft.driver_id}
              options={drivers.map((d) => ({ value: d.value, label: d.label, keywords: [d.employment ?? ""] }))}
              placeholder={t("roster.driver_placeholder")}
              onChange={(v) => {
                const d = drivers.find((x) => x.value === v);
                set({ driver_id: v ?? "", person_name: d?.label ?? draft.person_name, employment_id: d?.employment ?? draft.employment_id, role: v ? "driver" : draft.role });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rm-name">{t("roster.name")}</Label>
            <Input id="rm-name" className="h-10" value={draft.person_name} onChange={(e) => set({ person_name: e.target.value })} placeholder={t("roster.name_placeholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rm-emp">{t("roster.employment_id")}</Label>
            <Input id="rm-emp" className="h-10" value={draft.employment_id} onChange={(e) => set({ employment_id: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rm-team">{t("roster.team")}</Label>
            <Input
              id="rm-team"
              className="h-10"
              list="roster-teams"
              value={draft.team}
              onChange={(e) => set({ team: e.target.value, start_phase: teams.includes(e.target.value) ? phaseForTeam(e.target.value) : draft.start_phase })}
            />
            <datalist id="roster-teams">
              {teams.map((tm) => (
                <option key={tm} value={tm} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>{t("roster.start_phase")}</Label>
            <Select value={draft.start_phase} onValueChange={(v) => set({ start_phase: v })}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PATTERN.map((p, i) => (
                  <SelectItem key={p} value={String(i)}>
                    {t("roster.starts_on", { shift: t(`roster.shift.${p}`) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("roster.role")}</Label>
            <Select value={draft.role} onValueChange={(v) => set({ role: v as RosterMember["role"] })}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="driver">{t("roster.role.driver")}</SelectItem>
                <SelectItem value="coordinator">{t("roster.role.coordinator")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" className="h-10 w-full" onClick={add} disabled={busy}>
              <UserPlus /> {t("roster.add_person")}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {members.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("roster.empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("roster.team")}</th>
                  <th className="px-3 py-2 font-medium">{t("roster.name")}</th>
                  <th className="px-3 py-2 font-medium">{t("roster.start_phase")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5">
                      <Input className="h-8 w-28" defaultValue={m.team} list="roster-teams" onBlur={(e) => e.target.value.trim() && e.target.value !== m.team && move(m, { team: e.target.value.trim() })} aria-label={t("roster.team")} />
                    </td>
                    <td className="px-3 py-1.5">
                      {m.person_name}
                      {m.employment_id ? <span className="ml-1 text-xs text-muted-foreground">{m.employment_id}</span> : null}
                    </td>
                    <td className="px-3 py-1.5">
                      <Select value={String(m.start_phase)} onValueChange={(v) => move(m, { start_phase: Number(v) })}>
                        <SelectTrigger className="h-8 w-36" aria-label={t("roster.start_phase")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PATTERN.map((p, i) => (
                            <SelectItem key={p} value={String(i)}>
                              {t(`roster.shift.${p}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-danger" onClick={() => remove(m)} aria-label={t("roster.remove", { name: m.person_name })}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ open, onOpenChange, settings }: { open: boolean; onOpenChange: (o: boolean) => void; settings: RosterSettings }) {
  const router = useRouter();
  const [v, setV] = React.useState(settings);
  const [busy, setBusy] = React.useState(false);
  const field = (key: keyof RosterSettings, label: string, type: "time" | "date" | "number") => (
    <div className="space-y-1.5">
      <Label htmlFor={`rs-${key}`}>{label}</Label>
      <Input id={`rs-${key}`} type={type} className="h-10" value={String(v[key] ?? "")} min={type === "number" ? 1 : undefined} max={type === "number" ? 14 : undefined} onChange={(e) => setV({ ...v, [key]: type === "number" ? Number(e.target.value) : e.target.value })} />
    </div>
  );

  async function save() {
    setBusy(true);
    const { id, ...values } = v;
    const res = await saveRecord({ table: "roster_settings", id, values, revalidate: PATHS });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("common.saved"));
      onOpenChange(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("roster.settings")}</DialogTitle>
          <DialogDescription>{t("roster.settings_hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("cycle_start", t("roster.cycle_start"), "date")}
          {field("block_days", t("roster.block_days"), "number")}
          {field("day_from", t("roster.day_from"), "time")}
          {field("day_to", t("roster.day_to"), "time")}
          {field("noon_from", t("roster.noon_from"), "time")}
          {field("noon_to", t("roster.noon_to"), "time")}
          {field("night_from", t("roster.night_from"), "time")}
          {field("night_to", t("roster.night_to"), "time")}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
