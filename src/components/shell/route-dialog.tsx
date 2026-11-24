"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n";

/** Inside a route dialog: forms close it (back to the page underneath) instead of leaving the page. */
export const RouteDialogContext = React.createContext<{ close: () => void } | null>(null);

/**
 * A "new record" page opened from the app: shown over the page it was opened from, in a dialog as
 * large as the screen allows (fields in three columns where there is room). Opened from a link or
 * after a refresh, the same address shows the full page instead.
 */
export function RouteDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);
  const close = React.useCallback(() => {
    setOpen(false);
    router.back();
  }, [router]);
  const ctx = React.useMemo(() => ({ close }), [close]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent
        className="@container/dialog flex max-h-[94svh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,84rem)]"
        onInteractOutside={(e) => {
          // A click outside never throws away what was typed: close with the button or Cancel.
          e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">{t("common.new_record")}</DialogTitle>
        <DialogDescription className="sr-only">{t("common.new_record_hint")}</DialogDescription>
        <div className="route-dialog-body min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 md:p-6">
          <RouteDialogContext.Provider value={ctx}>{children}</RouteDialogContext.Provider>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** In a dialog the page's title heads the dialog; on a page it goes to the top bar as before. */
export function DialogAwareTitle({ title, description, fallback }: { title: string; description?: string; fallback: React.ReactNode }) {
  const dialog = React.useContext(RouteDialogContext);
  if (!dialog) return <>{fallback}</>;
  return (
    <div className="pr-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
