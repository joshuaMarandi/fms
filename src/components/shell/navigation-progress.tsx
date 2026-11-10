"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin bar at the top of the screen that starts the moment an internal link is clicked
 * and completes when the new route has rendered. Flat colour, no library.
 */
function Progress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");
  const [width, setWidth] = React.useState(0);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  // Route changed: finish the bar.
  React.useEffect(() => {
    stopTimer();
    const finish = setTimeout(() => {
      setState((s) => (s === "loading" ? "done" : s));
      setWidth((w) => (w > 0 ? 100 : 0));
    }, 0);
    const hide = setTimeout(() => {
      setState("idle");
      setWidth(0);
    }, 350);
    return () => {
      clearTimeout(finish);
      clearTimeout(hide);
    };
  }, [pathname, search]);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }
    function onSubmit() {
      // Server actions that redirect, and plain form posts such as sign out.
      start();
    }
    function start() {
      stopTimer();
      setState("loading");
      setWidth(12);
      timer.current = setInterval(() => setWidth((w) => (w < 85 ? w + (90 - w) * 0.08 : w)), 150);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("fms:navigate", onSubmit);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("fms:navigate", onSubmit);
      stopTimer();
    };
  }, []);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]" role="progressbar" aria-label="Loading page" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)}>
      <div className="h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${width}%`, opacity: state === "done" ? 0 : 1, transitionProperty: "width, opacity" }} />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <React.Suspense fallback={null}>
      <Progress />
    </React.Suspense>
  );
}

/** Call before a programmatic router.push so the bar shows for it too. */
export function startNavigationProgress() {
  if (typeof document !== "undefined") document.dispatchEvent(new Event("fms:navigate"));
}
