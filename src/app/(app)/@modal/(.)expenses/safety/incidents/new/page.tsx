import Page from "@/app/(app)/expenses/safety/incidents/new/page";
import { RouteDialog } from "@/components/shell/route-dialog";

type Props = { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Opened from inside the app: the new expenses/safety/incidents form in a dialog over the page it was opened from. */
export default async function NewInDialog(props: Props) {
  const render = Page as unknown as (p: Props) => React.ReactNode | Promise<React.ReactNode>;
  return <RouteDialog>{await render(props)}</RouteDialog>;
}
