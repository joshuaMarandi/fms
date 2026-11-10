import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/trainings/toolbox">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.trainings.toolbox" searchParams={sp} />;
}
