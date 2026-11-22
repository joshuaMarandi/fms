"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { UrlDateFilter } from "@/components/patterns/url-date-filter";
import type { PeriodKey } from "@/components/hub/periods";

/**
 * One date picker per page, in the top bar. Parts of a page that filter by date (summary cards,
 * tables) ask for it; the choice lives in the address (period, or from and to), so every part of
 * the page follows the same dates. A page may also put its own control in the top bar (InHeader).
 */
export type HeaderDateOptions = {
  defaultPeriod?: PeriodKey;
  allowAll?: boolean;
  /** Offer one exact date, or one month, first. */
  first?: "day" | "month";
  /** With no dates in the address, show the current month. */
  defaultMonth?: boolean;
  /** With no dates in the address, show today. */
  defaultDay?: boolean;
};

type Ctx = {
  requests: Map<number, HeaderDateOptions>;
  request: (id: number, o: HeaderDateOptions) => void;
  release: (id: number) => void;
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
};

const HeaderToolsContext = React.createContext<Ctx | null>(null);

export function HeaderToolsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = React.useState<Map<number, HeaderDateOptions>>(new Map());
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  const request = React.useCallback((id: number, o: HeaderDateOptions) => setRequests((m) => new Map(m).set(id, o)), []);
  const release = React.useCallback(
    (id: number) =>
      setRequests((m) => {
        const n = new Map(m);
        n.delete(id);
        return n;
      }),
    [],
  );
  const value = React.useMemo(() => ({ requests, request, release, slot, setSlot }), [requests, request, release, slot]);
  return <HeaderToolsContext.Provider value={value}>{children}</HeaderToolsContext.Provider>;
}

let nextId = 1;

/** Asks for the page's date picker in the top bar (when `enabled`). Returns whether the top bar has one. */
export function useHeaderDates(enabled: boolean, options?: HeaderDateOptions): boolean {
  const ctx = React.useContext(HeaderToolsContext);
  const [id] = React.useState(() => nextId++);
  const defaultPeriod = options?.defaultPeriod;
  const allowAll = options?.allowAll;
  const first = options?.first;
  const defaultMonth = options?.defaultMonth;
  const defaultDay = options?.defaultDay;
  const request = ctx?.request;
  const release = ctx?.release;
  React.useEffect(() => {
    if (!enabled || !request || !release) return;
    request(id, { defaultPeriod, allowAll, first, defaultMonth, defaultDay });
    return () => release(id);
  }, [enabled, id, request, release, defaultPeriod, allowAll, first, defaultMonth, defaultDay]);
  return enabled && !!ctx;
}

/** The defaults the page asked for (used to read the dates when the address has none). */
export function useHeaderDateOptions(): HeaderDateOptions {
  const ctx = React.useContext(HeaderToolsContext);
  return ctx ? ([...ctx.requests.values()].find((o) => o.defaultPeriod || o.allowAll === false || o.first || o.defaultMonth || o.defaultDay) ?? {}) : {};
}

/** Placed by a page (or its summary): this page is filtered by the date picker in the top bar. */
export function HeaderDates(props: HeaderDateOptions) {
  useHeaderDates(true, props);
  return null;
}

/** Puts a page's own control (for example a picker with months) in the top bar. */
export function InHeader({ children }: { children: React.ReactNode }) {
  const ctx = React.useContext(HeaderToolsContext);
  if (!ctx?.slot) return null;
  return createPortal(children, ctx.slot);
}

/** The top bar's place for the page's date picker and controls. */
export function HeaderToolsSlot() {
  const ctx = React.useContext(HeaderToolsContext);
  const options = useHeaderDateOptions();
  const setSlot = ctx?.setSlot;
  const ref = React.useCallback((el: HTMLDivElement | null) => setSlot?.(el), [setSlot]);
  return (
    <div className="flex items-center gap-2">
      {ctx && ctx.requests.size > 0 ? (
        <React.Suspense fallback={null}>
          <UrlDateFilter inHeader defaultPeriod={options.defaultPeriod} allowAll={options.allowAll !== false} first={options.first} defaultMonth={options.defaultMonth} defaultDay={options.defaultDay} />
        </React.Suspense>
      ) : null}
      <div ref={ref} className="flex items-center gap-2 empty:hidden" />
    </div>
  );
}
