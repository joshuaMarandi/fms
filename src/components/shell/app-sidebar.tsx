"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePermissions } from "@/components/permissions/provider";
import { buildResourceTree, filterTree, packageAllows, type ResourceNode } from "@/lib/permissions";
import { DynamicIcon } from "./icon";
import { LinkPending } from "./link-pending";
import { ProfileBlock } from "./profile-menu";
import { t, hasKey } from "@/i18n";

export type SidebarCounts = { pendingApprovals: number; openAnomalies: number; pendingRegistrations?: number };

function resourceLabel(node: ResourceNode) {
  const key = `resource.${node.key}`;
  return hasKey(key) ? t(key) : node.name;
}

function basePath(path: string | null) {
  return path ? path.split("?")[0]! : "";
}

export function AppSidebar({ counts }: { counts: SidebarCounts; companies?: { id: string; name: string }[] }) {
  const { permissions, session } = usePermissions();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const tree = React.useMemo(() => {
    const all = buildResourceTree(permissions.resources);
    if (session.platformMode) {
      // Owner on the platform: management pages only, as flat top-level items.
      const platform = all.find((n) => n.key === "platform");
      const settings = all.find((n) => n.key === "settings");
      const items = (platform?.children ?? []).map((c) => ({ ...c, children: [] }));
      const setting = settings ? [{ ...settings, children: settings.children.filter((c) => c.key === "settings.roles" || c.key === "settings.audit") }] : [];
      return [...items, ...setting];
    }
    // Fleet database and Driver details open one page each; their sections are tabs on that page.
    const SINGLE_PAGE = new Set(["fleet", "drivers"]);
    const visible = filterTree(permissions, all)
      .filter((n) => n.key !== "platform")
      .map((n) => (SINGLE_PAGE.has(n.key) ? { ...n, children: [] } : n));
    if (!session.isOwner) return visible;
    // Owner inside a company: show exactly the modules in that company's package.
    const keep = (nodes: ResourceNode[]): ResourceNode[] =>
      nodes.filter((n) => packageAllows(permissions.packageKeys, n.key)).map((n) => ({ ...n, children: keep(n.children) }));
    return keep(visible);
  }, [permissions, session.platformMode, session.isOwner]);

  const isActive = (path: string | null) => {
    const p = basePath(path);
    if (!p) return false;
    if (p === "/dashboard" || p === "/settings") return pathname === p;
    return pathname === p || pathname.startsWith(p + "/");
  };

  const groupActive = (node: ResourceNode) =>
    isActive(node.path) || node.children.some((c) => isActive(c.path) || c.children.some((g) => isActive(g.path)));

  const badgeFor = (key: string) => {
    if (key === "daily_use" || key === "expenses") return counts.pendingApprovals > 0 ? counts.pendingApprovals : null;
    if (key === "inspections") return counts.openAnomalies > 0 ? counts.openAnomalies : null;
    if (key === "platform.registrations") return (counts.pendingRegistrations ?? 0) > 0 ? counts.pendingRegistrations! : null;
    return null;
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="gap-2">
        <Link href={session.platformMode ? "/platform" : "/dashboard"} className="flex items-center gap-2 rounded-md px-1 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" onClick={() => setOpenMobile(false)}>
          {session.brand?.logoUrl && !session.platformMode ? (
            // eslint-disable-next-line @next/next/no-img-element -- small company logo from our own API, cached by the browser
            <img src={session.brand.logoUrl} alt="" className="size-8 shrink-0 rounded-md bg-white object-contain p-0.5" />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white p-0.5">
              <Image src="/brand/fms-mark.png" alt="" width={256} height={90} className="h-auto w-full" />
            </span>
          )}
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold leading-tight">{session.platformMode ? t("platform.sidebar_title") : session.companyName ?? t("app.short_name")}</span>
            <span className="block truncate text-xs opacity-75">{session.platformMode ? t("platform.sidebar_subtitle") : t("app.name")}</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {tree.map((node) => {
                const label = resourceLabel(node);
                const numbered = label;
                const badge = badgeFor(node.key);

                if (node.children.length === 0) {
                  return (
                    <SidebarMenuItem key={node.key}>
                      <SidebarMenuButton asChild isActive={isActive(node.path)} tooltip={numbered} className="h-10 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground">
                        <Link href={node.path ?? "#"} onClick={() => setOpenMobile(false)}>
                          <DynamicIcon icon={node.icon} />
                          <span>{numbered}</span>
                          <LinkPending />
                        </Link>
                      </SidebarMenuButton>
                      {badge ? (
                        <SidebarMenuBadge className="bg-warning-bg text-warning" aria-label={`${badge}`}>
                          {badge}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                }

                return (
                  <Collapsible key={node.key} asChild defaultOpen={groupActive(node)} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={numbered} isActive={isActive(node.path) && pathname === basePath(node.path)} className="h-10 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground">
                          <DynamicIcon icon={node.icon} />
                          <span>{numbered}</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden="true" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      {badge ? (
                        <SidebarMenuBadge className="right-8 bg-warning-bg text-warning" aria-label={node.key === "inspections" ? t("nav.open_anomalies", { count: badge }) : t("nav.pending_approvals", { count: badge })}>
                          {badge}
                        </SidebarMenuBadge>
                      ) : null}
                      <CollapsibleContent>
                        <SidebarMenuSub className="gap-1 py-1">
                          {node.children.map((child) => (
                            <SidebarMenuSubItem key={child.key}>
                              <SidebarMenuSubButton asChild isActive={isActive(child.path)} className="h-9 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground">
                                <Link href={child.path ?? node.path ?? "#"} onClick={() => setOpenMobile(false)}>
                                  <span>{resourceLabel(child)}</span>
                                  <LinkPending />
                                </Link>
                              </SidebarMenuSubButton>
                              {child.key !== "daily_use.trip_requests" && child.children.filter((g) => g.path).length > 0 ? (
                                <SidebarMenuSub className="mr-0 gap-1 border-l-0 pl-4">
                                  {child.children
                                    .filter((g) => g.path)
                                    .map((g) => (
                                      <SidebarMenuSubItem key={g.key}>
                                        <SidebarMenuSubButton asChild size="sm" isActive={isActive(g.path) && pathname === basePath(g.path)} className="h-8 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground">
                                          <Link href={g.path!} onClick={() => setOpenMobile(false)}>
                                            <span>{resourceLabel(g)}</span>
                                            <LinkPending />
                                          </Link>
                                        </SidebarMenuSubButton>
                                      </SidebarMenuSubItem>
                                    ))}
                                </SidebarMenuSub>
                              ) : null}
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <ProfileBlock variant="sidebar" />
      </SidebarFooter>
    </Sidebar>
  );
}
