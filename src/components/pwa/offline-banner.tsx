"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";
import { t } from "@/i18n";

export function OfflineBanner() {
  const [offline, setOffline] = React.useState(false);
  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-warning-bg px-4 py-2 text-sm text-warning">
      <WifiOff className="size-4" aria-hidden="true" />
      {t("common.offline")}
    </div>
  );
}
