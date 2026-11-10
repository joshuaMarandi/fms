import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PermissionProvider, type SessionLite } from "@/components/permissions/provider";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Topbar } from "@/components/shell/topbar";
import { RecordTitleProvider } from "@/components/shell/breadcrumbs";
import { DriverBottomNav } from "@/components/shell/driver-bottom-nav";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { SubscriptionBlocked } from "@/components/shell/subscription-blocked";
import { OwnerWorkspaceBar } from "@/components/shell/owner-workspace-bar";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n";
import type { NotificationRow } from "@/components/shell/notifications-bell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: shell } = await supabase.rpc("shell_counts");
  const counts = (shell ?? {}) as { pending_approvals?: number; open_anomalies?: number; pending_registrations?: number; unread?: number; notifications?: NotificationRow[] };
  const blocked = !session.permissions.isOwner && !(session.subscription?.active ?? false);

  const sessionLite: SessionLite = {
    userId: session.userId,
    email: session.email,
    fullName: session.profile.full_name,
    avatarUrl: session.profile.avatar_url,
    companyId: session.profile.company_id,
    companyName: session.company?.name ?? null,
    driverId: session.profile.driver_id,
    locale: (session.profile.locale as Locale) ?? "en",
    roleNames: session.roles.map((r) => r.name),
    primaryRole: session.roles[0]?.name ?? null,
    isDriverOnly: session.isDriverOnly,
    isOwner: session.permissions.isOwner,
    platformMode: session.platformMode,
  };

  return (
    <PermissionProvider session={sessionLite} permissions={session.permissions}>
      <RecordTitleProvider>
        <SidebarProvider>
          <AppSidebar
            counts={{
              pendingApprovals: counts.pending_approvals ?? 0,
              openAnomalies: counts.open_anomalies ?? 0,
              pendingRegistrations: counts.pending_registrations ?? 0,
            }}
            companies={session.companies}
          />
          <SidebarInset className="min-w-0">
            <Topbar notifications={counts.notifications ?? []} unread={counts.unread ?? 0} />
            <OfflineBanner />
            {session.permissions.isOwner && session.company ? <OwnerWorkspaceBar companyName={session.company.name} /> : null}
            <main className={`flex-1 p-4 md:p-6 ${session.isDriverOnly ? "pb-24 md:pb-6" : ""}`}>
              <div className="mx-auto w-full max-w-[1400px] space-y-6">{blocked ? <SubscriptionBlocked subscription={session.subscription} companyName={session.company?.name ?? null} /> : children}</div>
            </main>
            {session.isDriverOnly ? <DriverBottomNav /> : null}
          </SidebarInset>
        </SidebarProvider>
      </RecordTitleProvider>
    </PermissionProvider>
  );
}
