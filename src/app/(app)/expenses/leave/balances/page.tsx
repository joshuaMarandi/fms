import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/leave/balances">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.leave.balances" searchParams={sp} />;
}
