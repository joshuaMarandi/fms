"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/** Small spinner inside a Link while its navigation is pending. Must be rendered inside <Link>. */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-auto size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent transition-opacity",
        pending ? "animate-spin opacity-70" : "opacity-0",
        className,
      )}
    />
  );
}
