import { redirect } from "next/navigation";

/** Fuel cost is filled from the fuel log; new fuel is recorded there. */
export default function Page() {
  redirect("/daily-use/fuel-log");
}
