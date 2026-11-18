import { cn } from "@/lib/utils";
import { SetPageTitle } from "./page-title";

/**
 * A page's title and explanation go to the middle of the top bar (the explanation shows on hover),
 * so the page keeps its space for the data. Only the page's buttons stay here, on the right.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <SetPageTitle title={title} description={description} />
      {/* Kept for printing: the printed page still names what it is. */}
      <h2 className="print-only text-xl font-semibold">{title}</h2>
      {actions ? <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>{actions}</div> : null}
    </>
  );
}
