"use client";

import { icons, type LucideProps } from "lucide-react";

function toPascal(name: string) {
  return name
    .split("-")
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : ""))
    .join("");
}

/** Renders a lucide line icon by its kebab-case name (as stored on resources.icon). */
export function DynamicIcon({ icon, ...props }: { icon: string | null | undefined } & Omit<LucideProps, "name"> ) {
  if (!icon) return null;
  const key = toPascal(icon) as keyof typeof icons;
  const Cmp = icons[key];
  if (!Cmp) return null;
  return <Cmp aria-hidden="true" {...props} />;
}
