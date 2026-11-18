import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReminderChip } from "@/components/patterns/status-chip";
import { DocButton, type DocRef } from "@/components/patterns/doc-button";
import { formatDate } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

export type MandatoryRow = { id: string; courses: string[] | null; trainer: string | null; date_completed: string | null; refresher_date: string | null; no_expiry?: boolean };

const courseName = (c: string) => (hasKey(`expenses.trainings.course.${c}`) ? t(`expenses.trainings.course.${c}`) : c);

/** Mandatory trainings of one driver: course, trainer, dates and the certificate, with Add training. */
export function MandatoryTrainings({ driverId, rows, docs, canAdd, canAttach }: { driverId: string; rows: MandatoryRow[]; docs: Map<string, DocRef[]>; canAdd: boolean; canAttach: boolean }) {
  return (
    <section className="page-card p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("expenses.trainings.mandatory.title")}</h2>
        {canAdd ? (
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href={`/expenses/trainings/mandatory/new?driver=${driverId}`}>
              <Plus /> {t("drivers.add_training")}
            </Link>
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("drivers.no_mandatory_training")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="py-2 pr-3 font-medium">{t("drivers.course")}</th>
                <th className="py-2 pr-3 font-medium">{t("expenses.trainings.trainer")}</th>
                <th className="py-2 pr-3 font-medium">{t("drivers.date_of_completion")}</th>
                <th className="py-2 pr-3 font-medium">{t("drivers.training_expiry")}</th>
                <th className="py-2 font-medium">{t("drivers.certificate_pdf")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3">
                    <Link href={`/expenses/trainings/mandatory/${r.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {(r.courses ?? []).map(courseName).join(", ") || t("common.na")}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3">{r.trainer || <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{formatDate(r.date_completed)}</td>
                  <td className="py-2.5 pr-3">{r.no_expiry ? <span className="text-muted-foreground">{t("common.not_applicable")}</span> : r.refresher_date ? <ReminderChip date={r.refresher_date} showDate /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2.5">
                    <DocButton
                      docs={docs.get(r.id) ?? []}
                      compact
                      upload={canAttach ? { table: "mandatory_trainings", rowId: r.id, resource: "expenses.trainings.mandatory", bucket: "driver-docs", label: t("drivers.doc.course_certificates") } : null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
