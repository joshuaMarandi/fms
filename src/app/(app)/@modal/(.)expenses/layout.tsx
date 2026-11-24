import { RouteDialog } from "@/components/shell/route-dialog";

/** New forms of this part of the app open in one dialog, shown at once while the form loads. */
export default function DialogLayout({ children }: { children: React.ReactNode }) {
  return <RouteDialog>{children}</RouteDialog>;
}
