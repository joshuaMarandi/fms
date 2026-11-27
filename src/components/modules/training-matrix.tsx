"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TRAINING_COURSES, isRequired, type Need, type TrainingCourse } from "@/lib/training-matrix";
import { cn, formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type MatrixCell = { course: TrainingCourse; need: Need | null; done: string | null; until: string | null; state: "valid" | "due" | "expired" | "missing" };
export type MatrixDriver = { id: string; name: string; categories: string[]; cells: MatrixCell[]; missing: number };

/** Short column headings (the full name is the tooltip). */
const SHORT: Record<TrainingCourse, string> = {
  hse_induction: "HSE induction",
  defensive_driving: "Defensive driving",
  journey_fatigue: "Journey & fatigue",
  pretrip_ivms: "Pre-trip & IVMS",
  off_road: "Off-road",
  passenger_rollover: "Passenger & rollover",
  load_securement: "Load securement",
  dangerous_goods: "Dangerous goods",
  loading_fire: "Loading & fire",
  first_aid: "First aid",
};

/**
 * The training matrix: each active driver against the trainings their categories need, with the state
 * of each (valid, due soon, expired or missing). Required gaps are red; optional ones are grey.
 */
export function TrainingMatrix({ drivers, canAdd }: { drivers: MatrixDriver[]; canAdd: boolean }) {
  const [query, setQuery] = React.useState("");
  const [onlyGaps, setOnlyGaps] = React.useState(false);
  const q = query.trim().toLowerCase();
  const shown = drivers.filter((d) => (!q || d.name.toLowerCase().includes(q)) && (!onlyGaps || d.missing > 0 || d.categories.length === 0));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{t("training.matrix_title")}</CardTitle>
          <CardDescription className="max-w-3xl">{t("training.matrix_hint")}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("training.search")} aria-label={t("training.search")} className="h-10 w-56 pl-9" />
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm">
            <Checkbox checked={onlyGaps} onCheckedChange={(c) => setOnlyGaps(c === true)} />
            {t("training.only_gaps")}
          </label>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="sticky left-0 z-10 border-b bg-card py-2 pr-3 text-sm font-medium">
                {t("inspections.driver_name")}
              </th>
              {TRAINING_COURSES.map((c) => (
                <th key={c} scope="col" className="border-b px-1.5 py-2 text-center font-medium" title={t(`expenses.trainings.course.${c}`)}>
                  {SHORT[c]}
                </th>
              ))}
              <th scope="col" className="border-b px-2 py-2 font-medium">
                <span className="sr-only">{t("common.status")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id} className="align-top">
                <th scope="row" className="sticky left-0 z-10 border-b bg-card py-2 pr-3 text-left font-normal">
                  <Link href={`/drivers/${d.id}`} className="block text-sm font-medium hover:underline">
                    {d.name}
                  </Link>
                  <span className={cn("block", d.categories.length ? "text-muted-foreground" : "font-medium text-warning")}>
                    {d.categories.length ? d.categories.map((c) => t(`driver_category.${c}`)).join(", ") : t("training.no_category")}
                  </span>
                </th>
                {d.cells.map((cell) => (
                  <td key={cell.course} className="border-b px-1 py-1.5">
                    <Cell cell={cell} />
                  </td>
                ))}
                <td className="border-b px-2 py-2 whitespace-nowrap">
                  {d.categories.length === 0 ? null : d.missing ? (
                    <span className="status-chip status-chip-danger">{t("training.missing_count", { count: d.missing })}</span>
                  ) : (
                    <span className="status-chip status-chip-success">{t("training.all_done")}</span>
                  )}
                  {canAdd ? (
                    <Button asChild variant="ghost" size="sm" className="ml-1 h-7 px-2">
                      <Link href={`/expenses/trainings/mandatory/new?driver=${d.id}`} aria-label={`${t("training.add")}: ${d.name}`}>
                        <Plus />
                      </Link>
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Cell({ cell }: { cell: MatrixCell }) {
  const required = isRequired(cell.need);
  const needText = cell.need ? t(`training.need.${cell.need}`) : "";
  if (cell.need === "N" && cell.state === "missing") return <span className="block rounded-md px-1.5 py-1 text-center text-muted-foreground/60">—</span>;
  const tone =
    cell.state === "valid"
      ? "bg-success-bg text-success"
      : cell.state === "due"
        ? "bg-warning-bg text-warning"
        : required
          ? "bg-danger-bg text-danger"
          : "bg-muted/50 text-muted-foreground";
  const text =
    cell.state === "missing"
      ? required
        ? t("training.state.missing")
        : needText
      : cell.state === "valid"
        ? cell.until
          ? t("training.state.valid", { date: formatDate(cell.until) })
          : t("training.state.once", { date: formatDate(cell.done) })
        : cell.state === "due"
          ? t("training.state.due", { date: formatDate(cell.until) })
          : t("training.state.expired", { date: formatDate(cell.until) });
  return (
    <span className={cn("block rounded-md px-1.5 py-1 text-center leading-tight", tone)} title={`${t(`expenses.trainings.course.${cell.course}`)} · ${needText}`}>
      {text}
      {cell.need && cell.state !== "missing" ? <span className="block text-[10px] opacity-75">{needText}</span> : null}
    </span>
  );
}
