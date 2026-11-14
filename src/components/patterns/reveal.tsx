"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** An add form kept out of the way until its button is pressed. */
export function Reveal({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <Button type="button" className="h-10" onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
    );
  }
  return <>{children}</>;
}
