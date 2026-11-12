"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/patterns/date-picker";
import { FormActions } from "@/components/patterns/form-actions";
import { deleteRecord, saveRecord } from "@/lib/data/records";
import { cn, formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export const PROFESSIONAL_COURSES = ["advanced_vip2", "senior_vip1", "hgv", "psv", "other"] as const;
const INSTITUTIONS = ["NIT", "VETA"];

type CourseRow = { id?: string; course: string; course_other?: string | null; institution?: string | null; date_completed?: string | null };
type Draft = { checked: boolean; id?: string; course_other: string; institution: string; date_completed: string };

/**
 * Professional training: tick each course the driver has; each ticked course asks for the
 * university or college and the date, because courses are often taken at different places.
 */
export function CoursesEditor({ driverId, rows, readOnly }: { driverId: string; rows: CourseRow[]; readOnly?: boolean }) {
  const router = useRouter();
  const initial = React.useMemo(() => {
    const m: Record<string, Draft> = {};
    for (const c of PROFESSIONAL_COURSES) {
      const r = rows.find((x) => x.course === c);
      m[c] = { checked: !!r, id: r?.id, course_other: r?.course_other ?? "", institution: r?.institution ?? "", date_completed: r?.date_completed?.slice(0, 10) ?? "" };
    }
    return m;
  }, [rows]);
  // The page remounts this editor (key) when the saved courses change, so the draft starts fresh.
  const [draft, setDraft] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const set = (c: string, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [c]: { ...d[c]!, ...patch } }));
  const paths = [`/drivers/${driverId}`, "/drivers"];

  async function save() {
    const errs: Record<string, string> = {};
    for (const c of PROFESSIONAL_COURSES) {
      const d = draft[c]!;
      if (!d.checked) continue;
      if (!d.institution.trim()) errs[`${c}.institution`] = t("form.required");
      if (!d.date_completed) errs[`${c}.date_completed`] = t("form.required");
      if (c === "other" && !d.course_other.trim()) errs[`${c}.course_other`] = t("form.required");
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(t("form.fix_errors"));
      return;
    }
    setBusy(true);
    for (const c of PROFESSIONAL_COURSES) {
      const d = draft[c]!;
      if (d.checked) {
        const res = await saveRecord({
          table: "driver_courses",
          id: d.id ?? null,
          values: { driver_id: driverId, course: c, courses: [c], course_other: c === "other" ? d.course_other.trim() : null, institution: d.institution.trim(), date_completed: d.date_completed },
          revalidate: paths,
        });
        if (!res.ok) {
          setBusy(false);
          toast.error(res.error);
          return;
        }
      } else if (d.id) {
        const res = await deleteRecord("driver_courses", d.id, paths);
        if (!res.ok) {
          setBusy(false);
          toast.error(res.error);
          return;
        }
      }
    }
    setBusy(false);
    toast.success(t("common.saved"));
    router.refresh();
  }

  return (
    <section className="page-card p-4 md:p-6">
      <h2 className="text-base font-semibold">{t("drivers.tab.training")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("drivers.courses_hint")}</p>
      <datalist id="course-institutions">
        {INSTITUTIONS.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <div className="mt-4 space-y-3">
        {PROFESSIONAL_COURSES.map((c) => {
          const d = draft[c]!;
          const id = `course-${c}`;
          return (
            <div key={c} className={cn("rounded-lg border transition-colors", d.checked && "border-primary bg-primary/5")}>
              <label htmlFor={id} className="flex min-h-[48px] cursor-pointer items-center gap-3 px-3 py-2">
                <Checkbox id={id} checked={d.checked} disabled={readOnly} onCheckedChange={(v) => set(c, { checked: v === true })} />
                <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium">{t(`drivers.course.${c}`)}</span>
                {d.checked && d.institution && d.date_completed ? (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {d.institution} · {formatDate(d.date_completed)}
                  </span>
                ) : null}
              </label>
              {d.checked ? (
                <div className="grid gap-3 border-t px-3 py-3 md:grid-cols-2">
                  {c === "other" ? (
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor={`${id}-name`}>{t("drivers.course_other")}</Label>
                      <Input id={`${id}-name`} className="h-10" value={d.course_other} disabled={readOnly} aria-invalid={!!errors[`${c}.course_other`]} onChange={(e) => set(c, { course_other: e.target.value })} />
                      {errors[`${c}.course_other`] ? <p className="text-sm text-danger">{errors[`${c}.course_other`]}</p> : null}
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-inst`}>{t("drivers.institution")}</Label>
                    <Input id={`${id}-inst`} className="h-10" list="course-institutions" placeholder={t("drivers.institution_placeholder")} value={d.institution} disabled={readOnly} aria-invalid={!!errors[`${c}.institution`]} onChange={(e) => set(c, { institution: e.target.value })} />
                    {errors[`${c}.institution`] ? <p className="text-sm text-danger">{errors[`${c}.institution`]}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-date`}>{t("drivers.date_completed")}</Label>
                    <DatePicker id={`${id}-date`} value={d.date_completed} disabled={readOnly} onChange={(v) => set(c, { date_completed: v ?? "" })} />
                    {errors[`${c}.date_completed`] ? <p className="text-sm text-danger">{errors[`${c}.date_completed`]}</p> : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {!readOnly ? (
        <div className="mt-4">
          <FormActions onSave={save} busy={busy} />
        </div>
      ) : null}
    </section>
  );
}
