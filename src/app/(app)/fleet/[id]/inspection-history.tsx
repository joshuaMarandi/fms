import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReminderChip } from "@/components/patterns/status-chip";
import { DocButton, type DocRef, type DocUpload } from "@/components/patterns/doc-button";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type HistoryRow = {
  id: string;
  date: string | null;
  next: string | null;
  note: string | null;
  /** Record page, when the row has one. */
  href: string | null;
  docs: DocRef[];
  /** Where a report is attached from the row when it has none. */
  upload?: DocUpload | null;
};

/**
 * One kind of vehicle inspection (mobilization or third-party): the current next date, the report
 * from the Documents tab, an Add button and every inspection so far with its own documents.
 */
export function InspectionHistory({
  title,
  nextLabel,
  noteLabel,
  rows,
  report,
  addHref,
}: {
  title: string;
  nextLabel: string;
  /** Third column (notes or inspector); null leaves it out. */
  noteLabel: string | null;
  rows: HistoryRow[];
  /** The matching document from the vehicle's Documents tab. */
  report: DocRef[];
  addHref: string | null;
}) {
  const latest = rows[0] ?? null;
  return (
    <section className="page-card p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {nextLabel}: <ReminderChip date={latest?.next ?? null} showDate />
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {report.length ? <DocButton docs={report} label={t("docs.from_documents")} /> : null}
          {addHref ? (
            <Button asChild size="sm" className="h-8">
              <Link href={addHref}>
                <Plus /> {t("inspections.add")}
              </Link>
            </Button>
          ) : null}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("fleet.history.none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="py-2 pr-3 font-medium">{t("fleet.history.date")}</th>
                <th className="py-2 pr-3 font-medium">{nextLabel}</th>
                {noteLabel ? <th className="py-2 pr-3 font-medium">{noteLabel}</th> : null}
                <th className="py-2 font-medium">{t("docs.column")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    {r.href ? (
                      <Link href={r.href} className="font-medium text-primary underline-offset-4 hover:underline">
                        {formatDate(r.date)}
                      </Link>
                    ) : (
                      <span className="font-medium">{formatDate(r.date)}</span>
                    )}
                    {i === 0 ? <span className="status-chip status-chip-success ml-2">{t("fleet.history.latest")}</span> : null}
                  </td>
                  <td className="py-2 pr-3">{r.next ? formatDate(r.next) : <span className="text-muted-foreground">—</span>}</td>
                  {noteLabel ? <td className="max-w-[280px] py-2 pr-3 whitespace-pre-line">{r.note || <span className="text-muted-foreground">—</span>}</td> : null}
                  <td className="py-2">
                    <DocButton docs={r.docs} compact upload={r.upload} />
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
