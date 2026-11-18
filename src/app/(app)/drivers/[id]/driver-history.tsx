import { DocButton, type DocRef, type DocUpload } from "@/components/patterns/doc-button";
import { t } from "@/i18n";

/**
 * Every record of one kind for a driver (licences or OSHA tests), newest first, with the document
 * of each one behind an eye in the last column.
 */
export function DriverHistory({
  title,
  headers,
  rows,
  docHeader,
}: {
  title: string;
  headers: string[];
  /** upload: where a missing document is attached from the row (an Attach button instead of —). */
  rows: { id: string; cells: React.ReactNode[]; docs: DocRef[]; current?: boolean; upload?: DocUpload | null }[];
  docHeader: string;
}) {
  return (
    <section className="page-card mt-6 p-4 md:p-5">
      <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("drivers.history.none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                {headers.map((h) => (
                  <th key={h} className="py-2 pr-3 font-medium">
                    {h}
                  </th>
                ))}
                <th className="py-2 font-medium">{docHeader}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  {r.cells.map((c, i) => (
                    <td key={i} className="py-2.5 pr-3">
                      {c}
                      {i === 0 && r.current ? <span className="status-chip status-chip-success ml-2">{t("drivers.history.current")}</span> : null}
                    </td>
                  ))}
                  <td className="py-2.5">
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

/** Files uploaded in the old Documents tab that belong with this tab (opened with the eye). */
export function EarlierDocs({ title, docs }: { title: string; docs: DocRef[] }) {
  if (docs.length === 0) return null;
  return (
    <section className="page-card mt-6 flex flex-wrap items-center gap-3 p-4 md:p-5">
      <h3 className="mr-auto text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {docs.map((d) => (
        <DocButton key={d.id} docs={[d]} />
      ))}
    </section>
  );
}
