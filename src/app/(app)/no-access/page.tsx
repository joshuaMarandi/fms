import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export default async function NoAccessPage({ searchParams }: PageProps<"/no-access">) {
  const sp = await searchParams;
  const resource = typeof sp.resource === "string" ? sp.resource : null;
  return (
    <div className="page-card mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger">
        <ShieldOff className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">{t("common.no_access_title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("common.no_access_description")}</p>
      {resource ? <p className="mt-2 font-mono text-xs text-muted-foreground">{resource}</p> : null}
      <Button asChild className="mt-6">
        <Link href="/dashboard">{t("common.go_dashboard")}</Link>
      </Button>
    </div>
  );
}
