/**
 * Requests that go through several approval steps, in order, with the permission (approve) each step
 * needs. Mirrors public.staged_steps in the database.
 */
export type ApprovalStep = { step: string; label: string; resource: string };

export const STAGED_STEPS: Record<string, ApprovalStep[]> = {
  leave_requests: [
    { step: "approval", label: "approval.step.fleet_manager", resource: "expenses.leave.requests" },
    { step: "hr_review", label: "approval.step.hr_review", resource: "expenses.leave.requests.hr" },
    { step: "hod_approval", label: "approval.step.hod_final", resource: "expenses.leave.requests.hod" },
  ],
  outstation_requests: [
    { step: "approval", label: "approval.step.fleet_manager", resource: "expenses.admin.outstation" },
    // The HOD approves the outstation allowance (the final approval), then it goes to finance.
    { step: "hod_verify", label: "approval.step.hod_final", resource: "expenses.admin.outstation.hod" },
  ],
  petty_cash_requests: [
    { step: "approval", label: "approval.step.fleet_manager_verify_amount", resource: "expenses.admin.petty_cash" },
    { step: "hod_approval", label: "approval.step.hod_verify", resource: "expenses.admin.petty_cash.hod" },
  ],
  petty_cash_transactions: [
    { step: "approval", label: "approval.step.fleet_manager_verify", resource: "expenses.admin.petty_cash" },
    { step: "hod_verify", label: "approval.step.hod_verify", resource: "expenses.admin.petty_cash.hod" },
  ],
  timesheets: [
    { step: "approval", label: "approval.step.fleet_manager", resource: "expenses.timesheet" },
    { step: "hod_approval", label: "approval.step.hod_approval", resource: "expenses.timesheet.hod" },
  ],
  maintenance_invoices: [
    { step: "approval", label: "approval.step.fleet_manager", resource: "expenses.maintenance.costs" },
    { step: "hod_approval", label: "approval.step.hod_approval", resource: "expenses.maintenance.costs.hod" },
  ],
};

/** Requests that are verified rather than approved (the same steps, other words). */
export const VERIFY_TABLES = new Set(["petty_cash_requests", "petty_cash_transactions"]);

/** Tables whose approval sends email and SMS links. */
export const LINK_TABLES = new Set(["leave_requests", "vehicle_requests", ...Object.keys(STAGED_STEPS)]);

/** The step a submitted request is waiting on. */
export function currentStep(table: string, record: { status?: unknown; approval_step?: unknown }): ApprovalStep | null {
  const steps = STAGED_STEPS[table];
  if (!steps || record.status !== "submitted") return null;
  return steps.find((s) => s.step === ((record.approval_step as string | null) ?? "approval")) ?? steps[0]!;
}
