import { ModuleListPage } from "@/components/modules/module-list-page";

/** Spare parts of every vehicle (each vehicle's month shows them in its tab). */
export default async function Page({ searchParams }: PageProps<"/expenses/maintenance/costs/spare-parts">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.maintenance.spare_parts" searchParams={sp} />;
}
