"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { toast } from "sonner";
import { saveRecord } from "@/lib/data/records";
import { cn, formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type MatrixTalk = { id: string; week_number: number | null; month: number | null; date_from: string | null; date_to: string | null; topics: string };
type Mark = { id: string; toolbox_plan_id: string; driver_id: string; attended: boolean };

/**
 * Drivers down the side, toolbox talks across the top. A tick means the driver attended. People who
 * may edit click a cell to mark or clear attendance; the row and column totals update at once.
 */
export function ToolboxMatrix({ drivers, talks, attendance, canEdit }: { drivers: { id: string; full_name: string }[]; talks: MatrixTalk[]; attendance: Mark[]; canEdit: boolean }) {
  const [marks, setMarks] = React.useState(() => new Map(attendance.map((a) => [`${a.toolbox_plan_id}:${a.driver_id}`, a])));
  const [busy, setBusy] = React.useState<string | null>(null);

  if (talks.length === 0) {
    return (
      <p className="page-card p-6 text-center text-sm text-muted-foreground">
        {t("toolbox.matrix.no_talks")}{" "}
        <Link href="/expenses/trainings/toolbox/new" className="text-primary underline-offset-4 hover:underline">
          {t("toolbox.matrix.add_talk")}
        </Link>
      </p>
    );
  }

  const attended = (talk: string, driver: string) => !!marks.get(`${talk}:${driver}`)?.attended;

  async function toggle(talk: string, driver: string) {
    if (!canEdit) return;
    const key = `${talk}:${driver}`;
    const current = marks.get(key);
    const next = !current?.attended;
    setBusy(key);
    const res = await saveRecord({ table: "toolbox_attendance", id: current?.id ?? null, values: { toolbox_plan_id: talk, driver_id: driver, attended: next }, revalidate: ["/expenses/trainings/matrix"] });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMarks((m) => new Map(m).set(key, { id: res.data!.id, toolbox_plan_id: talk, driver_id: driver, attended: next }));
  }

  const talkLabel = (x: MatrixTalk) => (x.week_number ? t("toolbox.matrix.week", { week: x.week_number }) : formatDate(x.date_from));

  return (
    <div className="page-card overflow-x-auto">
      {canEdit ? <p className="border-b px-4 py-2 text-xs text-muted-foreground">{t("toolbox.matrix.hint")}</p> : null}
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-[180px] bg-muted/50 px-4 py-2.5 font-medium">
              {t("inspections.driver")}
            </th>
            {talks.map((x) => (
              <th key={x.id} scope="col" className="min-w-[96px] px-2 py-2.5 text-center font-medium" title={x.topics}>
                <span className="block">{talkLabel(x)}</span>
                <span className="block max-w-[120px] truncate font-normal normal-case">{x.topics}</span>
              </th>
            ))}
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              {t("toolbox.matrix.attended")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {drivers.map((d) => {
            const count = talks.filter((x) => attended(x.id, d.id)).length;
            return (
              <tr key={d.id}>
                <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">
                  {d.full_name}
                </th>
                {talks.map((x) => {
                  const on = attended(x.id, d.id);
                  const key = `${x.id}:${d.id}`;
                  return (
                    <td key={x.id} className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={!canEdit || busy === key}
                        onClick={() => toggle(x.id, d.id)}
                        aria-pressed={on}
                        aria-label={`${d.full_name}, ${talkLabel(x)}: ${on ? t("toolbox.matrix.attended") : t("toolbox.matrix.not_attended")}`}
                        className={cn(
                          "inline-flex size-8 items-center justify-center rounded-md border transition-colors",
                          on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                          canEdit && "hover:border-primary",
                          busy === key && "opacity-50",
                        )}
                      >
                        {on ? <Check className="size-4" /> : <Minus className="size-3.5" />}
                      </button>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right tabular-nums">
                  {count} / {talks.length}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t bg-muted/30 text-xs">
          <tr>
            <th scope="row" className="sticky left-0 bg-muted/30 px-4 py-2 text-left font-medium">
              {t("toolbox.matrix.attended")}
            </th>
            {talks.map((x) => (
              <td key={x.id} className="px-2 py-2 text-center tabular-nums">
                {drivers.filter((d) => attended(x.id, d.id)).length} / {drivers.length}
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
