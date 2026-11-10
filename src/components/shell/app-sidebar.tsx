"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Truck } from "lucide-react";
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
import { buildResourceTree, filterTree, type ResourceNode } from "@/lib/permissions";
import { DynamicIcon } from "./icon";
import { LinkPending } from "./link-pending";
import { CompanySwitcher } from "./company-switcher";
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

export function AppSidebar({ counts, companies }: { counts: SidebarCounts; companies: { id: string; name: string }[] }) {
  const { permissions, session } = usePermissions();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const tree = React.useMemo(() => filterTree(permissions, buildResourceTree(permissions.resources)), [permissions]);

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
    if (key === "platform") return (counts.pendingRegistrations ?? 0) > 0 ? counts.pendingRegistrations! : null;
    return null;
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="gap-2">
        <Link href="/dashboard" className="flex items-center gap-2 rounded-md px-1 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" onClick={() => setOpenMobile(false)}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Truck className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold leading-tight">{session.companyName ?? t("app.short_name")}</span>
            <span className="block truncate text-xs opacity-75">{t("app.short_name")}</span>
          </span>
        </Link>
        {companies.length > 1 ? <CompanySwitcher companies={companies} current={session.companyId} /> : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {tree.map((node) => {
                const label = resourceLabel(node);
                const numbered = node.label_prefix && /^\d+$/.test(node.label_prefix) ? `${node.label_prefix} ${label}` : label;
                const badge = badgeFor(node.key);

                if (node.children.length === 0) {
                  return (
                    <SidebarMenuItem key={node.key}>
                      <SidebarMenuButton asChild isActive={isActive(node.path)} tooltip={numbered} className="data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground">
                        <Link href={node.path ?? "#"} onClick={() => setOpenMobile(false)}>
                          <DynamicIcon icon={node.icon} />
                          <span>{numbered}</span>
                          <LinkPending />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <Collapsible key={node.key} asChild defaultOpen={groupActive(node)} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={numbered} isActive={isActive(node.path) && pathname === basePath(node.path)} className="data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground">
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
                        <SidebarMenuSub>
                          {node.children.map((child) => (
                            <SidebarMenuSubItem key={child.key}>
                              <SidebarMenuSubButton asChild isActive={isActive(child.path)} className="h-8 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground">
                                <Link href={child.path ?? node.path ?? "#"} onClick={() => setOpenMobile(false)}>
                                  <span>{resourceLabel(child)}</span>
                                  <LinkPending />
                                </Link>
                              </SidebarMenuSubButton>
                              {child.children.filter((g) => g.path).length > 0 ? (
                                <SidebarMenuSub className="mr-0 border-l-0 pl-4">
                                  {child.children
                                    .filter((g) => g.path)
                                    .map((g) => (
                                      <SidebarMenuSubItem key={g.key}>
                                        <SidebarMenuSubButton asChild size="sm" isActive={isActive(g.path) && pathname === basePath(g.path)} className="h-7 data-active:bg-sidebar-active data-active:text-sidebar-accent-foreground">
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
