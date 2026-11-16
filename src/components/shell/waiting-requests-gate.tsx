"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlarmClock, ArrowRight, BellRing, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { callRpc } from "@/lib/data/records";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

type Waiting = { record_id: string; table_name: string; step: string; step_label: string; summary: string | null; requester: string | null; since: string; in_app: boolean };

const SNOOZE_KEY = "fms.waiting.snoozeUntil";
const SKIP_KEY = "fms.waiting.skipped";
const SNOOZE_MS = 5 * 60_000;
const POLL_MS = 60_000;

const readSnooze = () => {
  try {
    return Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
  } catch {
    return 0;
  }
};
const readSkipped = (): string[] => {
  try {
    return JSON.parse(window.sessionStorage.getItem(SKIP_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

/**
 * A vehicle request waiting on the signed-in person takes over the screen until they deal with it.
 * They can open it, be reminded in 5 minutes, or skip it for this session and carry on working.
 * It never shows on the request's own page.
 */
export function WaitingRequestsGate() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = React.useState<Waiting[]>([]);
  const [snoozeUntil, setSnoozeUntil] = React.useState(0);
  const [skipped, setSkipped] = React.useState<string[]>([]);
  const [now, setNow] = React.useState(0);

  const load = React.useCallback(async () => {
    const res = await callRpc<Waiting[]>("my_waiting_requests", {});
    if (res.ok) setItems(res.data ?? []);
    setNow(Date.now());
  }, []);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      setSnoozeUntil(readSnooze());
      setSkipped(readSkipped());
      void load();
    });
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelAnimationFrame(id);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Check again after moving between pages (a decision just made clears it).
  React.useEffect(() => {
    const id = window.setTimeout(() => void load(), 400);
    return () => window.clearTimeout(id);
  }, [pathname, load]);

  // Wake up when the snooze ends.
  React.useEffect(() => {
    if (!snoozeUntil) return;
    const wait = snoozeUntil - Date.now();
    if (wait <= 0) return;
    const id = window.setTimeout(() => setNow(Date.now()), wait + 50);
    return () => window.clearTimeout(id);
  }, [snoozeUntil]);

  const onRequestPage = (id: string) => pathname?.startsWith(`/daily-use/trip-requests/${id}`);
  const shown = items.filter((w) => !skipped.includes(`${w.record_id}:${w.step}`));
  const open = shown.length > 0 && now >= snoozeUntil && !shown.some((w) => onRequestPage(w.record_id));

  function snooze() {
    const until = Date.now() + SNOOZE_MS;
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(until));
    } catch {
      /* storage unavailable: the snooze lasts until the page reloads */
    }
    setSnoozeUntil(until);
  }

  function skip() {
    const next = [...skipped, ...shown.map((w) => `${w.record_id}:${w.step}`)];
    try {
      window.sessionStorage.setItem(SKIP_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setSkipped(next);
  }

  function openRequest(w: Waiting) {
    startNavigationProgress();
    router.push(`/daily-use/trip-requests/${w.record_id}`);
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-lg border-2 border-primary/40"
      >
        <DialogHeader>
          <span className="mb-1 flex size-12 items-center justify-center rounded-xl bg-warning-bg text-warning">
            <BellRing className="size-6" aria-hidden="true" />
          </span>
          <DialogTitle className="text-xl">{shown.length === 1 ? t("waiting.title_one") : t("waiting.title_many", { count: shown.length })}</DialogTitle>
          <DialogDescription>{t("waiting.description")}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[45vh] space-y-2 overflow-y-auto">
          {shown.map((w) => (
            <li key={`${w.record_id}:${w.step}`} className="rounded-lg border p-3">
              <p className="font-semibold">{w.summary ?? t("waiting.vehicle_request")}</p>
              <p className="text-sm text-muted-foreground">
                {w.requester ? `${w.requester} · ` : ""}
                {t("waiting.since", { date: formatDate(w.since, true) })}
              </p>
              <p className="mt-1 text-sm">
                <span className="status-chip status-chip-warning">{w.step_label}</span>
              </p>
              <Button type="button" className="mt-3 h-10 w-full" onClick={() => openRequest(w)}>
                {w.in_app ? t("waiting.open_task") : t("waiting.open_decide")} <ArrowRight />
              </Button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="h-10" onClick={snooze}>
            <AlarmClock /> {t("waiting.remind")}
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={skip}>
            <SkipForward /> {t("waiting.skip")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
