"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AttachmentsBox } from "./attachments-box";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

/** An attached file, as loaded on the server for a list or a record. */
export type DocRef = { id: string; label: string; file_name: string; mime_type: string | null; bucket: string; path: string; expiry_date?: string | null; created_at?: string | null };

/** Where a new document for this row is uploaded, when the viewer may add one. */
export type DocUpload = { table: string; rowId: string; resource: string; bucket: string; label: string; sensitive?: boolean; /** File types to offer (defaults to the label). */ labels?: string[] };

const isImage = (m: string | null) => !!m && m.startsWith("image/");
const isPdf = (m: string | null) => m === "application/pdf";

/**
 * A small button for the documents attached to a row or record. One document opens straight in a
 * viewer dialog; several show a short list first. With `upload`, a row without a document offers
 * to attach one. Clicks never reach the table row behind it.
 */
export function DocButton({ docs, upload, compact, label }: { docs: DocRef[]; upload?: DocUpload | null; compact?: boolean; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [current, setCurrent] = React.useState<{ doc: DocRef; url: string | null; loading: boolean } | null>(null);

  React.useEffect(() => {
    const url = current?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [current?.url]);

  async function show(doc: DocRef) {
    setCurrent({ doc, url: null, loading: true });
    const { data, error } = await createClient().storage.from(doc.bucket).download(doc.path);
    if (error || !data) {
      setCurrent(null);
      toast.error(error?.message ?? t("attachments.open_failed"));
      return;
    }
    const blob = doc.mime_type && data.type !== doc.mime_type ? new Blob([data], { type: doc.mime_type }) : data;
    setCurrent({ doc, url: URL.createObjectURL(blob), loading: false });
  }

  async function download(doc: DocRef) {
    const { data, error } = await createClient().storage.from(doc.bucket).download(doc.path);
    if (error || !data) {
      toast.error(error?.message ?? t("attachments.open_failed"));
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openViewer() {
    setOpen(true);
    if (docs.length === 1) void show(docs[0]!);
    else setCurrent(null);
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (docs.length === 0) {
    if (!upload) return compact ? <span className="text-muted-foreground">—</span> : <span className="text-sm text-muted-foreground">{t("docs.none")}</span>;
    return (
      <span onClick={stop} onKeyDown={stop} className="inline-flex">
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setAdding(true)}>
          <Upload /> {t("docs.attach")}
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
              <DialogTitle>{upload.label}</DialogTitle>
              <DialogDescription>{t("docs.attach_hint")}</DialogDescription>
            </DialogHeader>
            <AttachmentsBox table={upload.table} rowId={upload.rowId} resource={upload.resource} bucket={upload.bucket} labels={upload.labels ?? [upload.label]} multiple={(upload.labels?.length ?? 1) > 1} sensitive={upload.sensitive} />
            <DialogFooter>
              <Button type="button" onClick={() => setAdding(false)}>
                {t("common.done")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </span>
    );
  }

  return (
    <span onClick={stop} onKeyDown={stop} className="inline-flex">
      {compact ? (
        // In a table: just an eye (with the count when there are several); it only appears when a file exists.
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="relative h-8 w-8 p-0 text-primary hover:bg-primary/10"
          onClick={openViewer}
          aria-label={docs.length === 1 ? `${t("docs.view")}: ${docs[0]!.label}` : t("docs.view_count", { count: docs.length })}
          title={docs.length === 1 ? docs[0]!.label : t("docs.view_count", { count: docs.length })}
        >
          <Eye className="size-[18px]" />
          {docs.length > 1 ? <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{docs.length}</span> : null}
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={openViewer} aria-label={t("docs.view_count", { count: docs.length })}>
          <Eye />
          {label ?? (docs.length === 1 ? docs[0]!.label : t("docs.view_count", { count: docs.length }))}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setCurrent(null);
        }}
      >
        <DialogContent className="flex h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-3 p-4 sm:max-w-[min(96vw,1200px)] sm:p-5">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{current ? current.doc.label : t("docs.title")}</DialogTitle>
            <DialogDescription className="truncate">{current ? current.doc.file_name : t("docs.choose")}</DialogDescription>
          </DialogHeader>
          {!current ? (
            <ul className="min-h-0 flex-1 divide-y overflow-auto rounded-lg border">
              {docs.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => show(d)} className="flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-muted/40">
                    <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.file_name}
                        {d.expiry_date ? ` · ${t("attachments.expiry")}: ${formatDate(d.expiry_date)}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : current.loading ? (
            <Skeleton className="min-h-0 w-full flex-1" />
          ) : current.url ? (
            isImage(current.doc.mime_type) ? (
              <div className="min-h-0 flex-1 overflow-auto rounded border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob, not optimisable */}
                <img src={current.url} alt={current.doc.label} className="block h-auto w-full" />
              </div>
            ) : isPdf(current.doc.mime_type) ? (
              <object data={current.url} type="application/pdf" className="min-h-0 w-full flex-1 rounded border">
                <p className="p-6 text-center text-sm text-muted-foreground">{t("attachments.no_inline_preview")}</p>
              </object>
            ) : (
              <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">{t("attachments.no_inline_preview")}</p>
            )
          ) : null}
          {current && !current.loading ? (
            <DialogFooter>
              {docs.length > 1 ? (
                <Button type="button" variant="ghost" onClick={() => setCurrent(null)} className="mr-auto">
                  {t("docs.all")}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => download(current.doc)}>
                <Download /> {t("common.download")}
              </Button>
              {current.url ? (
                <Button type="button" asChild>
                  <a href={current.url} target="_blank" rel="noreferrer">
                    {t("attachments.open")}
                  </a>
                </Button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </span>
  );
}
