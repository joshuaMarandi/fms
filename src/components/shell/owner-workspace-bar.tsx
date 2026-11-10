"use client";

import * as React from "react";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exitToPlatform } from "@/app/(app)/platform/actions";
import { startNavigationProgress } from "./navigation-progress";
import { t } from "@/i18n";

/** Shown while the owner works inside a company's workspace. */
export function OwnerWorkspaceBar({ companyName }: { companyName: string }) {
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-sidebar px-4 py-2 text-sm text-sidebar-foreground md:px-6">
      <Building2 className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {t("platform.workspace.viewing")} <span className="font-semibold">{companyName}</span>
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        className="h-9 border-sidebar-foreground/40 bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => {
          startNavigationProgress();
          start(() => exitToPlatform());
        }}
      >
        <ArrowLeft /> {t("platform.workspace.back")}
      </Button>
    </div>
  );
}
