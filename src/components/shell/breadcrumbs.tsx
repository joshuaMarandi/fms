"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { usePermissions } from "@/components/permissions/provider";
import { firstPageUnder, menuItemFor, menuTrail } from "@/lib/nav/menu-trail";
import { hasKey, t } from "@/i18n";

type Crumb = { label: string; href?: string };

const RecordTitleContext = React.createContext<{ title: string | null; setTitle: (s: string | null) => void }>({ title: null, setTitle: () => {} });

export function RecordTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<string | null>(null);
  return <RecordTitleContext.Provider value={{ title, setTitle }}>{children}</RecordTitleContext.Provider>;
}

/** Pages with a record set its label for the breadcrumb (Module, Submodule, Record). */
export function useRecordTitle(title: string | null | undefined) {
  const { setTitle } = React.useContext(RecordTitleContext);
  React.useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}

const STATIC: Record<string, string> = {
  "/administration/petty-cash/transactions": "admin.petty_cash.transactions",
  "/profile": "nav.my_profile",
  "/notifications": "nav.notifications",
  "/no-access": "common.no_access_title",
  "/demo": "demo.title",
};

// Menu groups that are pages of their own (the rest open their first page, as in the menu).
const GROUP_PAGES = new Set(["fleet", "drivers", "inspections"]);

const PREVIOUS = "fms-previous-page";

/** The page shown before this one in the app (to go back to it from Cancel). */
export function previousAppPage(): string | null {
  try {
    return sessionStorage.getItem(PREVIOUS);
  } catch {
    return null;
  }
}

export function Breadcrumbs() {
  const pathname = usePathname();
  // Remember the page before this one, with its filters.
  const current = React.useRef<string | null>(null);
  React.useEffect(() => {
    const here = window.location.pathname + window.location.search;
    if (current.current && current.current !== here) {
      try {
        sessionStorage.setItem(PREVIOUS, current.current);
      } catch {
        // Storage blocked: Cancel falls back to the module's page.
      }
    }
    current.current = here;
  }, [pathname]);
  const { resources, can: allowed } = usePermissions();
  const { title } = React.useContext(RecordTitleContext);

  const crumbs = React.useMemo<Crumb[]>(() => {
    const name = (r: { key: string; name: string }) => (hasKey(`resource.${r.key}`) ? t(`resource.${r.key}`) : r.name);
    // Follow the menu: the page's menu item and its groups, then New or the record.
    const item = menuItemFor(resources, pathname);
    if (item?.path) {
      const visible = (r: { key: string }) => allowed(r.key, "view");
      const out: Crumb[] = menuTrail(resources, item).map((r) => {
        if (r.key === item.key || (r.path && GROUP_PAGES.has(r.key))) return { label: name(r), href: r.path ? r.path.split("?")[0] : undefined };
        return { label: name(r), href: firstPageUnder(resources, r.key, visible) ?? undefined };
      });
      const itemBase = item.path.split("?")[0]!.replace(/\/$/, "");
      const rest = pathname.slice(itemBase.length).split("/").filter(Boolean);
      let acc = itemBase;
      rest.forEach((seg, i) => {
        acc += "/" + seg;
        if (seg === "new") out.push({ label: t("common.new") });
        else if (STATIC[acc]) out.push({ label: t(STATIC[acc]), href: acc });
        else if (i === rest.length - 1) out.push({ label: title ?? t("common.record") });
      });
      return out;
    }
    const byPath = new Map<string, { key: string; name: string }>();
    for (const r of resources) {
      if (r.path) byPath.set(r.path.split("?")[0]!, { key: r.key, name: r.name });
    }
    const label = (p: string) => {
      const r = byPath.get(p);
      if (r) return hasKey(`resource.${r.key}`) ? t(`resource.${r.key}`) : r.name;
      if (STATIC[p]) return t(STATIC[p]);
      return null;
    };
    const segments = pathname.split("/").filter(Boolean);
    const out: Crumb[] = [];
    let acc = "";
    for (let i = 0; i < segments.length; i++) {
      acc += "/" + segments[i];
      const l = label(acc);
      if (l) {
        out.push({ label: l, href: acc });
      } else if (segments[i] === "new") {
        out.push({ label: t("common.new") });
      } else if (i === segments.length - 1) {
        out.push({ label: title ?? t("common.record") });
      }
    }
    return out;
  }, [pathname, resources, title, allowed]);

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap gap-1 text-[11px] leading-4 sm:gap-1 [&_svg]:size-3">
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink asChild>
            <Link href="/dashboard">{t("nav.home")}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <React.Fragment key={`${c.href ?? c.label}-${i}`}>
              <BreadcrumbSeparator className={i === 0 ? "hidden md:block" : undefined} />
              <BreadcrumbItem>
                {last || !c.href ? (
                  <BreadcrumbPage className="max-w-[180px] truncate text-muted-foreground">{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="max-w-[140px] truncate">
                    <Link href={c.href}>{c.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
