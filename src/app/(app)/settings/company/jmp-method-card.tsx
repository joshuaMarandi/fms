"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { callRpc } from "@/lib/data/records";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

type Method = "automatic" | "manual";

/** How long trips handle their journey management plan. Applies to trips sent from now on. */
export function JmpMethodCard({ method, canEdit }: { method: Method; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = React.useState<Method>(method);
  const [busy, setBusy] = React.useState(false);

  async function choose(next: Method) {
    if (!canEdit || next === value || busy) return;
    setBusy(true);
    const res = await callRpc("set_company_setting", { p_key: "jmp_method", p_value: next }, ["/settings/company"]);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setValue(next);
    toast.success(t("settings.company.saved"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("jmp.settings.title")}</CardTitle>
        <CardDescription>{t("jmp.settings.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={t("jmp.settings.title")}>
          {(["automatic", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={value === m}
              disabled={!canEdit || busy}
              onClick={() => choose(m)}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                value === m ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/60",
                (!canEdit || busy) && "cursor-not-allowed opacity-80",
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <span className={cn("size-4 rounded-full border-2", value === m ? "border-primary bg-primary" : "border-muted-foreground/40")} aria-hidden="true" />
                {t(`jmp.method.${m}`)}
              </span>
              <span className="mt-2 block text-sm text-muted-foreground">{t(`jmp.settings.${m}`)}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("jmp.settings.note")}</p>
      </CardContent>
    </Card>
  );
}
