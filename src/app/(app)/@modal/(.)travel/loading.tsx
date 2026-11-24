import { FormSkeleton } from "@/components/shell/skeletons";

/** Shown inside the dialog the moment it opens, until the form is ready. */
export default function Loading() {
  return <FormSkeleton />;
}
