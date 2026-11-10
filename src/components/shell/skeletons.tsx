import { Skeleton } from "@/components/ui/skeleton";

/** Page title and description placeholder. */
function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-32" />
        ))}
      </div>
    </div>
  );
}

/** List pages: header, toolbar and table rows. */
export function ListPageSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <HeaderSkeleton />
      <div className="page-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="ml-auto h-10 w-28" />
        </div>
        <div className="divide-y">
          <div className="flex gap-4 px-4 py-3">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-3 flex-1" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 px-4 py-3.5">
              {Array.from({ length: columns }).map((_, i) => (
                <Skeleton key={i} className={i === columns - 1 ? "h-5 w-20 rounded-md" : "h-4 flex-1"} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t p-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
      </div>
    </div>
  );
}

/** Dashboard: KPI cards, chart cards and lists. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <HeaderSkeleton actions={2} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="page-card space-y-3 p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="page-card space-y-3 p-5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-64 max-w-full" />
            <div className="flex h-[220px] items-end gap-2 pt-4">
              {[40, 65, 50, 80, 55, 70, 45, 90].map((h, j) => (
                <Skeleton key={j} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Record forms: sections of label and input pairs, then the save bar. */
export function FormSkeleton({ sections = 2, withSide = false }: { sections?: number; withSide?: boolean }) {
  const form = (
    <div className="space-y-6">
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className="page-card space-y-5 p-4 md:p-6">
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <HeaderSkeleton actions={0} />
      {withSide ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">{form}</div>
          <div className="page-card h-fit space-y-4 p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ) : (
        form
      )}
    </div>
  );
}

/** Profile pages with tabs (vehicle, driver, company). */
export function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <HeaderSkeleton actions={2} />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28" />
        ))}
      </div>
      <FormSkeleton sections={1} />
    </div>
  );
}

/** Card grids (packages, settings home, registrations). */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <HeaderSkeleton />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="page-card space-y-3 p-5">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-40" />
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-3/4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
