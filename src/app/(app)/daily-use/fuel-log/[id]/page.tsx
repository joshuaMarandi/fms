import { redirect } from "next/navigation";
import { ModuleRecordPage } from "@/components/modules/module-record-page";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * A fuel log row opens the fuel request it was issued against. Older links here pointed at fuel
 * requests (the page used to be the request list), so those go to the request too.
 */
export default async function Page({ params }: PageProps<"/daily-use/fuel-log/[id]">) {
  const { id } = await params;
  await requirePermission("daily_use.fuel_log", "view");
  const supabase = await createClient();
  const [{ data: request }, { data: issue }] = await Promise.all([
    supabase.from("fuel_requests").select("id").eq("id", id).maybeSingle(),
    supabase.from("fuel_issues").select("fuel_request_id").eq("id", id).maybeSingle(),
  ]);
  if (request) redirect(`/daily-use/fuel-requests/${id}`);
  const from = (issue as { fuel_request_id: string | null } | null)?.fuel_request_id;
  if (from) redirect(`/daily-use/fuel-requests/${from}`);
  return <ModuleRecordPage moduleKey="daily_use.fuel_issues" id={id} />;
}
