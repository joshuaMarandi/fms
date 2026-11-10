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
  "/profile": "nav.my_profile",
  "/notifications": "nav.notifications",
  "/no-access": "common.no_access_title",
  "/demo": "demo.title",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const { resources } = usePermissions();
  const { title } = React.useContext(RecordTitleContext);

  const crumbs = React.useMemo<Crumb[]>(() => {
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
  }, [pathname, resources, title]);

  return (
    <Breadcrumb>
      <BreadcrumbList>
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
                  <BreadcrumbPage className="max-w-[220px] truncate">{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="max-w-[160px] truncate">
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
