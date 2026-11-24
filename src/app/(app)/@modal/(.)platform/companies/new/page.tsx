import Page from "@/app/(app)/platform/companies/new/page";

type Props = { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Opened from inside the app: the new platform/companies form in the dialog (see the layout) over the page it was opened from. */
export default async function NewInDialog(props: Props) {
  const render = Page as unknown as (p: Props) => React.ReactNode | Promise<React.ReactNode>;
  return await render(props);
}
