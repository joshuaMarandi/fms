"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

const MINE = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const CHECK_EVERY_MS = 60_000;
const RELOADED_KEY = "fms.reloaded-for";

/** True while the person is in the middle of something that a reload would lose. */
function busy() {
  if (document.querySelector('form[data-dirty="true"]')) return true;
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
  const el = document.activeElement;
  return !!el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "button") || (el as HTMLElement).isContentEditable);
}

function reloadOnce(version: string) {
  try {
    // Never loop: one reload per new version.
    if (window.sessionStorage.getItem(RELOADED_KEY) === version) return false;
    window.sessionStorage.setItem(RELOADED_KEY, version);
  } catch {
    /* storage blocked: reload anyway */
  }
  window.location.reload();
  return true;
}

/**
 * Keeps open pages on the latest deploy. Checks the server's version every minute and when the tab
 * comes back into view; a new version reloads the page by itself, or, when a form has unsaved
 * changes, shows a bar to reload when ready. Also recovers from "chunk failed to load" after a deploy.
 */
export function VersionWatcher() {
  const [waiting, setWaiting] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || MINE === "dev") return;
    let stopped = false;

    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!version || version === "dev" || version === MINE) return;
        if (busy()) setWaiting(version);
        else reloadOnce(version);
      } catch {
        /* offline or server restarting: try again later */
      }
    };

    // A script from the old build that no longer exists on the server: load the new build.
    const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = String("reason" in e ? (e.reason?.message ?? e.reason) : e.message);
      if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) reloadOnce(`chunk-${MINE}`);
    };

    const timer = window.setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    const first = window.setTimeout(check, 5_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onError);
    };
  }, []);

  // While waiting, reload as soon as the person is no longer busy (form saved or closed).
  React.useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      if (!busy()) reloadOnce(waiting);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  if (!waiting) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 print:hidden">
      <div className="flex max-w-xl flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-lg">
        <RefreshCw className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">{t("app.update_ready")}</span>
        <Button size="sm" onClick={() => reloadOnce(waiting)}>
          {t("app.update_now")}
        </Button>
      </div>
    </div>
  );
}
