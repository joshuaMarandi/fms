"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AttachmentsBox } from "./attachments-box";
import { DocButton, type DocRef } from "./doc-button";
import { t } from "@/i18n";

/** Where the missing documents of a row are attached (rows that are not pulled from elsewhere). */
export type RowDocsUpload = { table: string; rowId: string; resource: string; bucket: string };

/**
 * The documents of one row in a record's table: the eye lists them to choose one to view. Documents
 * that belong to the row itself (another road user's vehicle) can be attached here; documents pulled
 * from elsewhere (the fleet, the driver record) that are missing are named, to add them there.
 */
export function RowDocs({ docs, missing, upload }: { docs: DocRef[]; missing: string[]; upload?: RowDocsUpload | null }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {docs.length ? <DocButton docs={docs} compact /> : null}
      {missing.length && upload ? (
        <>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setAdding(true)}>
            <Paperclip /> {t("docs.attach")}
          </Button>
          <Dialog
            open={adding}
            onOpenChange={(o) => {
              setAdding(o);
              if (!o) router.refresh();
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("docs.attach")}</DialogTitle>
                <DialogDescription>{missing.join(", ")}</DialogDescription>
              </DialogHeader>
              <AttachmentsBox table={upload.table} rowId={upload.rowId} resource={upload.resource} bucket={upload.bucket} labels={missing} multiple={missing.length > 1} />
              <DialogFooter>
                <Button type="button" onClick={() => setAdding(false)}>
                  {t("common.done")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
      {missing.length ? (
        <span className="text-xs text-danger">{t(upload ? "docs.missing" : "docs.missing_elsewhere", { labels: missing.join(", ") })}</span>
      ) : null}
      {!docs.length && !missing.length ? <span className="text-muted-foreground">—</span> : null}
    </span>
  );
}
