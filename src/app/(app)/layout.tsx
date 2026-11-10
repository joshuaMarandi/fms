import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PermissionProvider, type SessionLite } from "@/components/permissions/provider";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Topbar } from "@/components/shell/topbar";
import { RecordTitleProvider } from "@/components/shell/breadcrumbs";
import { DriverBottomNav } from "@/components/shell/driver-bottom-nav";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n";
import type { NotificationRow } from "@/components/shell/notifications-bell";

const REQUEST_TABLES = ["fuel_requests", "vehicle_requests", "maintenance_requests", "tyre_requests", "wash_requests", "leave_requests", "timesheets"] as const;
const REQUEST_RESOURCES: Record<(typeof REQUEST_TABLES)[number], string> = {
  fuel_requests: "daily_use.fuel_log",
  vehicle_requests: "daily_use.trip_requests",
  maintenance_requests: "expenses.maintenance.requests",
  tyre_requests: "expenses.tyres",
  wash_requests: "expenses.washing",
  leave_requests: "expenses.leave.requests",
  timesheets: "expenses.timesheet",
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const supabase = await createClient();

  const approvable = REQUEST_TABLES.filter((tbl) => session.can(REQUEST_RESOURCES[tbl], "approve"));
  const [pendingCounts, anomalies, notifications, unread] = await Promise.all([
    Promise.all(approvable.map((tbl) => supabase.from(tbl).select("id", { count: "exact", head: true }).eq("status", "submitted").is("deleted_at", null))),
    session.can("inspections", "view")
      ? supabase.from("inspection_anomalies").select("id", { count: "exact", head: true }).eq("status", "open").is("deleted_at", null)
      : Promise.resolve({ count: 0 }),
    supabase.from("notifications").select("id, kind, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);

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
  };

  return (
    <PermissionProvider session={sessionLite} permissions={session.permissions}>
      <RecordTitleProvider>
        <SidebarProvider>
          <AppSidebar
            counts={{
              pendingApprovals: pendingCounts.reduce((sum, r) => sum + (r.count ?? 0), 0),
              openAnomalies: anomalies.count ?? 0,
            }}
            companies={session.companies}
          />
          <SidebarInset className="min-w-0">
            <Topbar notifications={(notifications.data ?? []) as NotificationRow[]} unread={unread.count ?? 0} />
            <OfflineBanner />
            <main className={`flex-1 p-4 md:p-6 ${session.isDriverOnly ? "pb-24 md:pb-6" : ""}`}>
              <div className="mx-auto w-full max-w-[1400px] space-y-6">{children}</div>
            </main>
            {session.isDriverOnly ? <DriverBottomNav /> : null}
          </SidebarInset>
        </SidebarProvider>
      </RecordTitleProvider>
    </PermissionProvider>
  );
}
