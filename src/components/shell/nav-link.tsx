"use client";

import * as React from "react";
import Link from "next/link";

/**
 * Sidebar link that loads the whole page in the background as soon as the pointer rests on it (or it
 * gets keyboard focus or a touch), so the click usually opens it at once. Until then it prefetches
 * only the page's loading screen, like any link. Every other prop (styles, data attributes from the
 * sidebar button) passes straight through.
 */
export function NavLink({ onMouseEnter, onFocus, onTouchStart, ...props }: React.ComponentProps<typeof Link>) {
  const [warm, setWarm] = React.useState(false);
  return (
    <Link
      {...props}
      prefetch={warm ? true : null}
      onMouseEnter={(e) => {
        setWarm(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setWarm(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setWarm(true);
        onTouchStart?.(e);
      }}
    />
  );
}
