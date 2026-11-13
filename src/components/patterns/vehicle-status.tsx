"use client";

import { StatusChip } from "@/components/patterns/status-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n";

/**
 * One status per vehicle: Out of service (hover or focus shows the reason), Not safe for use (an open
 * anomaly marked Immediately on a vehicle still in service), or In service. Never two at once.
 */
export function VehicleStatus({ status, reason, notSafe }: { status: string; reason?: string | null; notSafe?: boolean }) {
  if (status === "out_of_service") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cursor-help rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${t("status.out_of_service")}. ${t("fleet.status_reason")}: ${reason || t("fleet.status_reason_none")}`} onClick={(e) => e.stopPropagation()}>
            <StatusChip status={status} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <span className="font-medium">{t("fleet.status_reason")}:</span> {reason || t("fleet.status_reason_none")}
        </TooltipContent>
      </Tooltip>
    );
  }
  return <StatusChip status={notSafe ? "not_safe" : status} />;
}

/** The value used for sorting and filtering, matching what VehicleStatus shows. */
export function vehicleStatusKey(status: string, notSafe?: boolean) {
  return status === "out_of_service" ? "out_of_service" : notSafe ? "not_safe" : status;
}
