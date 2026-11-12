import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TONE, CLICKABLE_CARD, type Tone } from "@/components/patterns/tone";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

/** A KPI card that is one big link: accent bar, value, coloured icon tile and an "Open" hint. */
export function StatCard({
  title,
  value,
  href,
  icon: Icon,
  tone,
  danger,
  sub,
  children,
}: {
  title: string;
  value: string;
  href: string;
  icon: LucideIcon;
  tone: Tone;
  danger?: boolean;
  sub?: string;
  children?: React.ReactNode;
}) {
  const c = TONE[danger ? "red" : tone];
  return (
    <Link href={href} className={cn("group rounded-xl", CLICKABLE_CARD)}>
      <Card className={cn("h-full gap-2 pt-0 transition-colors", c.ring, danger && "ring-danger/40")}>
        <span className={cn("h-1 w-full", c.bar)} aria-hidden="true" />
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-0">
          <span className="min-w-0">
            <CardDescription className="text-xs font-medium">{title}</CardDescription>
            <CardTitle className={cn("mt-1 truncate text-2xl tabular-nums", danger && "text-danger")}>{value}</CardTitle>
          </span>
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", c.tile)} aria-hidden="true">
            <Icon className="size-5" />
          </span>
        </CardHeader>
        <CardContent className="mt-auto space-y-1">
          {children ?? (sub ? <p className="line-clamp-2 text-xs text-muted-foreground">{sub}</p> : null)}
          <span className={cn("inline-flex items-center gap-1 pt-1 text-xs font-medium opacity-80 transition-opacity group-hover:opacity-100", c.text)}>
            {t("dashboard.open")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Header of a list card: coloured icon, title and a "View all" link. */
export function ListCardHeader({ title, icon: Icon, tone, href }: { title: string; icon: LucideIcon; tone: Tone; href?: string }) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-3">
      <span className="flex items-center gap-3">
        <span className={cn("flex size-9 items-center justify-center rounded-lg", TONE[tone].tile)} aria-hidden="true">
          <Icon className="size-[18px]" />
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
      </span>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
          {t("dashboard.view_all")} <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </CardHeader>
  );
}

/** Class for a list row that is a link. */
export const ROW_LINK = "flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5";
