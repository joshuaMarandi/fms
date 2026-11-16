import { redirectToFirstChild } from "@/lib/nav/group-redirect";

/** Fleet administration has no page of its own: open the first page under it the user can view. */
export default async function Page() {
  return redirectToFirstChild("/administration");
}
