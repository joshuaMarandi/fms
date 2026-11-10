import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/leave/plan">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.leave.plan" searchParams={sp} />;
}
