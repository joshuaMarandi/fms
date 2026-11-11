import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { packageAllows } from "@/lib/permissions";

/**
 * A sidebar group (for example Trainings) has no page of its own. Send the user to the first
 * sub-page under it, in sidebar order, that they can view; otherwise to the No access page.
 */
export async function redirectToFirstChild(groupPath: string): Promise<never> {
  const session = await requireSession();
  if (session.platformMode) redirect("/platform");
  const { resources, packageKeys } = session.permissions;
  const prefix = groupPath.replace(/\/$/, "") + "/";
  const target = resources
    .filter((r) => r.path && r.path.split("?")[0]!.startsWith(prefix))
    .sort((a, b) => a.sort_order - b.sort_order || (a.path!.length - b.path!.length))
    .find((r) => packageAllows(packageKeys, r.key) && session.can(r.key, "view"));
  if (target?.path) redirect(target.path);
  const group = resources.find((r) => r.path?.split("?")[0] === groupPath);
  redirect(`/no-access?resource=${encodeURIComponent(group?.key ?? groupPath)}&action=view`);
}
