import { redirectToFirstChild } from "@/lib/nav/group-redirect";

/** Group link: opens the first sub-page the user can view. */
export default async function Page() {
  return redirectToFirstChild("/daily-use");
}
