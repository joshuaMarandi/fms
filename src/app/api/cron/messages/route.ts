import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";
import { dispatchOutbox } from "@/lib/messaging/dispatch";

/**
 * Sends approval emails and SMS still waiting in the outbox (normally they go out within seconds;
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
  const result = await dispatchOutbox(publicOrigin(request), 200);
  return NextResponse.json({ ...result, errors: result.errors.slice(0, 10) });
}

export const GET = handle;
export const POST = handle;
