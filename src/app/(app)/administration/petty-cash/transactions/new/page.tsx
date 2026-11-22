import { ModuleRecordPage } from "@/components/modules/module-record-page";

/** Opened from a petty cash request: that request is chosen. */
export default async function Page({ searchParams }: PageProps<"/administration/petty-cash/transactions/new">) {
  const sp = await searchParams;
  const request = typeof sp.request === "string" && /^[0-9a-f-]{36}$/i.test(sp.request) ? sp.request : null;
  return <ModuleRecordPage moduleKey="expenses.admin.petty_cash.transactions" preset={request ? { petty_cash_request_id: request } : undefined} />;
}
