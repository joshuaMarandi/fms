import { ModuleListPage } from "@/components/modules/module-list-page";

export default async function Page({ searchParams }: PageProps<"/expenses/trainings/mandatory">) {
  const sp = await searchParams;
  return <ModuleListPage moduleKey="expenses.trainings.mandatory" searchParams={sp} />;
}
