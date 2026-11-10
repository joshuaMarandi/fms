"use client";

import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/i18n";

export function MarkAllReadButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const supabase = createClient();
        await supabase.rpc("mark_notifications_read", { p_ids: null });
        router.refresh();
      }}
    >
      <CheckCheck /> {t("nav.mark_all_read")}
    </Button>
  );
}
