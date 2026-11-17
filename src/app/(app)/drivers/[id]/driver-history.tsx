import { DocButton, type DocRef } from "@/components/patterns/doc-button";
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
  rows: { id: string; cells: React.ReactNode[]; docs: DocRef[]; current?: boolean }[];
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
                    <DocButton docs={r.docs} compact />
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
