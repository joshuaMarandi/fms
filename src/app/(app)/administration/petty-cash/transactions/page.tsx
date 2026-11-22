import { ModuleListPage } from "@/components/modules/module-list-page";

/** Every petty cash transaction (each spend with its receipt and approval). */
export default async function Page({ searchParams }: PageProps<"/administration/petty-cash/transactions">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.admin.petty_cash.transactions" searchParams={sp} />;
}
