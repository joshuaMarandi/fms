import { redirect } from "next/navigation";

/** Maintenance and repairs are both recorded in Maintenance and repair cost. */
export default function Page() {
  redirect("/expenses/maintenance/costs/new");
}
