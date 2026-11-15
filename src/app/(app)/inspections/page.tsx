import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DynamicIcon } from "@/components/shell/icon";
import { AddMenu } from "@/components/hub/view-all-menu";
import { inspectionChoices } from "@/components/hub/inspection-hubs";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const TONE = { neutral: "text-muted-foreground", success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

/** Inspections: just the three kinds. Each opens its own page of vehicles. */
export default async function InspectionsPage() {
  const { session, choices } = await inspectionChoices();
  if (session.platformMode) redirect("/platform");
  if (choices.length === 0) redirect("/no-access?resource=inspections&action=view");

  return (
    <>
      <PageHeader
        title={t("inspections.title")}
        description={t("inspections.choose")}
        actions={<AddMenu items={choices.filter((c) => c.create).map((c) => ({ href: c.create!, label: c.title }))} label={t("inspections.add")} />}
      />
      <ul className="grid gap-4 md:grid-cols-3">
        {choices.map((c) => (
          <li key={c.key}>
            <Link href={c.href} className="page-card group flex h-full flex-col gap-4 p-5 transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="flex items-start justify-between gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <DynamicIcon icon={c.icon} className="size-6" />
                </span>
                <ChevronRight className="mt-1 size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-lg font-semibold">{c.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{c.description}</span>
              </span>
              <span className="mt-auto space-y-0.5 border-t pt-3 text-sm">
                <span className={cn("block font-medium", TONE[c.line.tone])}>{c.line.text}</span>
                {c.alert ? <span className={cn("block font-medium", TONE[c.alert.tone])}>{c.alert.text}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
