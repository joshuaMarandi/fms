import "server-only";
import { after } from "next/server";
import { appUrl } from "@/lib/app-url";
import { dispatchOutbox } from "./dispatch";

export const WORKFLOW_TABLES = new Set(["leave_requests", "vehicle_requests", "outstation_requests", "petty_cash_requests", "petty_cash_transactions", "timesheets", "maintenance_invoices"]);
export const WORKFLOW_RPCS = new Set(["submit_request", "approve_request", "reject_request", "sign_jmp", "send_work_order"]);

/** Send the outbox right after the response, so the next approver gets the email and SMS within seconds. */
export async function sendMessagesSoon() {
  let base: string;
  try {
    base = await appUrl();
  } catch {
    return;
  }
  after(async () => {
    try {
      await dispatchOutbox(base);
    } catch (e) {
      console.error("[messages]", (e as Error).message);
    }
  });
}
