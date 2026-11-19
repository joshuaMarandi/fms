"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type PageTitle = { title: string; description?: string } | null;

const PageTitleContext = React.createContext<{ value: PageTitle; set: (v: PageTitle) => void }>({ value: null, set: () => {} });

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [value, set] = React.useState<PageTitle>(null);
  return <PageTitleContext.Provider value={{ value, set }}>{children}</PageTitleContext.Provider>;
}

/** Placed by a page's header: sends its title (and explanation) to the top bar. */
export function SetPageTitle({ title, description }: { title: string; description?: string }) {
  const { set } = React.useContext(PageTitleContext);
  React.useEffect(() => {
    set({ title, description });
    return () => set(null);
  }, [title, description, set]);
  return null;
}

/**
 * The page's title in the middle of the top bar. Its explanation shows when it is hovered or
 * focused, so the page itself stays free for the data.
 */
export function TopbarTitle() {
  const { value } = React.useContext(PageTitleContext);
  if (!value?.title) return null;
  const heading = <h1 className="truncate text-left text-[15px] leading-5 font-semibold tracking-tight">{value.title}</h1>;
  if (!value.description) return heading;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="-mx-1 min-w-0 max-w-full cursor-help rounded px-1 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring" aria-describedby="page-title-help">
          {heading}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-sm text-sm leading-snug">
        <span id="page-title-help">{value.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}
