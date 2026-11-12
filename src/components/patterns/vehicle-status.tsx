"use client";

import { StatusChip } from "@/components/patterns/status-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n";

/** In service or Out of service; hovering (or focusing) Out of service shows the reason. */
export function VehicleStatus({ status, reason, notSafe }: { status: string; reason?: string | null; notSafe?: boolean }) {
  const chip = <StatusChip status={status} />;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {status === "out_of_service" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="cursor-help rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${t("status.out_of_service")}: ${reason || t("fleet.status_reason_none")}`} onClick={(e) => e.stopPropagation()}>
              {chip}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <span className="font-medium">{t("fleet.status_reason")}:</span> {reason || t("fleet.status_reason_none")}
          </TooltipContent>
        </Tooltip>
      ) : (
        chip
      )}
      {notSafe ? <StatusChip status="not_safe" /> : null}
    </span>
  );
}
