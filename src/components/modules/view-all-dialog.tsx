"use client";

import * as React from "react";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * A button that opens a large dialog with content rendered on the server (for example a petty cash
 * request's totals and its transactions). Following a link inside closes it first, so a form opened
 * from it (Add transaction, Edit) shows on its own.
 */
export function ViewAllDialog({ label, title, description, children }: { label: string; title: string; description?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" className="h-10 w-full" onClick={() => setOpen(true)}>
        <ListChecks /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[94svh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,72rem)]">
          <DialogHeader className="border-b p-4 pr-12 md:px-6">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6"
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a[href]")) setOpen(false);
            }}
          >
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
