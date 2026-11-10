"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/permissions/provider";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * Save and Cancel for every form.
 * Desktop: an inline row at the end of the form.
 * Phone: a bar fixed to the bottom of the screen, rendered at the document root so no animated
 * or scrolling container can push it off screen, and lifted above the driver bottom navigation.
 * The submit button targets the form by id, so it works from outside the form element.
 */
export function FormActions({
  formId,
  onSave,
  onCancel,
  busy,
  saveLabel,
  cancelLabel,
  disabled,
  children,
}: {
  /** id of the <form>; the Save button submits it. Use onSave instead for forms without a <form>. */
  formId?: string;
  onSave?: () => void;
  onCancel?: () => void;
  busy?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  /** Extra buttons shown before Cancel (for example Delete). */
  children?: React.ReactNode;
}) {
  const session = useSession();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const buttons = (
    <>
      {children}
      {onCancel ? (
        <Button type="button" variant="outline" size="lg" className="flex-1 md:flex-none" onClick={onCancel}>
          {cancelLabel ?? t("common.cancel")}
        </Button>
      ) : null}
      <Button
        type={formId ? "submit" : "button"}
        form={formId}
        onClick={formId ? undefined : onSave}
        size="lg"
        className="flex-1 md:flex-none"
        disabled={busy || disabled}
      >
        {busy ? t("common.saving") : saveLabel ?? t("common.save")}
      </Button>
    </>
  );

  return (
    <>
      <div className="hidden items-center justify-end gap-2 md:flex">{buttons}</div>
      {/* Space so the last field is not hidden behind the phone bar. */}
      <div className={cn("md:hidden", session.isDriverOnly ? "h-36" : "h-20")} aria-hidden="true" />
      {mounted
        ? createPortal(
            <div
              className={cn(
                "no-print fixed inset-x-0 z-40 flex items-center gap-2 border-t bg-card px-4 py-3 md:hidden",
                session.isDriverOnly ? "bottom-[calc(56px+env(safe-area-inset-bottom))]" : "bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
              )}
            >
              {buttons}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
