import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/washing">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.washing" searchParams={sp} />;
}
