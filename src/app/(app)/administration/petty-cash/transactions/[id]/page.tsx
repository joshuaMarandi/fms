import { ModuleRecordPage } from "@/components/modules/module-record-page";

export default async function Page({ params }: PageProps<"/administration/petty-cash/transactions/[id]">) {
  const { id } = await params;
  return <ModuleRecordPage moduleKey="expenses.admin.petty_cash.transactions" id={id} />;
}
