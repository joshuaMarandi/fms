import { redirect } from "next/navigation";

/** Records open (and are edited) in Maintenance and repair cost. */
export default async function Page({ params }: PageProps<"/expenses/repair-cost/[id]">) {
  const { id } = await params;
  redirect(`/expenses/maintenance/costs/${id}`);
}
