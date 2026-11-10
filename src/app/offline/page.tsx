import { WifiOff } from "lucide-react";
import { t } from "@/i18n";

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="page-card max-w-md p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-bg text-warning">
          <WifiOff className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">{t("app.short_name")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("common.offline")}</p>
      </div>
    </main>
  );
}
