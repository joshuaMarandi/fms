import { ModuleListPage } from "@/components/modules/module-list-page";

/** Invoices of every vehicle (each vehicle's month shows them in its tab). */
export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/costs/invoices">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.maintenance.invoices" searchParams={sp} />;
}
