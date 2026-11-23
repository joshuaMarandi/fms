import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";
import { dispatchOutbox } from "@/lib/messaging/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sends timesheets that are due to their employees (the month's last day, from 16:00), then the
 * approval emails and SMS still waiting in the outbox (normally they go out within seconds;
 * this catches retries after a mail or SMS outage). Call it every few minutes from cron:
 *
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/messages
 */
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Timesheets whose month has ended go to their employees to sign (from 16:00 on the last day).
  const { data: timesheets, error: tsError } = await createAdminClient().rpc("timesheets_send_due");
  if (tsError) console.error("[timesheets]", tsError.message);
  const result = await dispatchOutbox(publicOrigin(request), 200);
  return NextResponse.json({ ...result, timesheets_sent: timesheets ?? 0, errors: result.errors.slice(0, 10) });
}

export const GET = handle;
export const POST = handle;
