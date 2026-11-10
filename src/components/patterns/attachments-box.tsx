"use client";

import * as React from "react";
import { Eye, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusChip } from "./status-chip";
import { ConfirmDialog } from "./confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/components/permissions/provider";
import { cn, daysUntil, formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type AttachmentRow = {
  id: string;
  label: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  expiry_date: string | null;
  bucket: string;
  path: string;
  created_at: string;
};

const MAX_MB = 20;

/** Drag and drop, type label, expiry date, status chip (Uploaded, Missing, Expired). */
export function AttachmentsBox({
  table,
  rowId,
  resource,
  bucket,
  labels,
  multiple = true,
  sensitive,
  readOnly,
  className,
}: {
  table: string;
  rowId: string | null;
  resource: string;
  bucket: string;
  /** Expected document types; each shows Missing until uploaded */
  labels?: string[];
  multiple?: boolean;
  sensitive?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const { can, session } = usePermissions();
  const [rows, setRows] = React.useState<AttachmentRow[]>([]);
  const [label, setLabel] = React.useState(labels?.[0] ?? "");
  const [expiry, setExpiry] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [preview, setPreview] = React.useState<{ url: string; name: string; mime: string | null } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const canUpload = !readOnly && !!rowId && (can(resource, "edit") || can(resource, "create"));
  const canDelete = !readOnly && can(resource, "delete");

  const fetchRows = React.useCallback(async (): Promise<AttachmentRow[]> => {
    if (!rowId) return [];
    const supabase = createClient();
    const { data } = await supabase.from("attachments").select("id, label, file_name, mime_type, size_bytes, expiry_date, bucket, path, created_at").eq("table_name", table).eq("row_id", rowId).is("deleted_at", null).order("created_at", { ascending: false });
    return (data ?? []) as AttachmentRow[];
  }, [table, rowId]);

  const load = React.useCallback(async () => {
    setRows(await fetchRows());
  }, [fetchRows]);

  React.useEffect(() => {
    let active = true;
    fetchRows().then((r) => {
      if (active) setRows(r);
    });
    return () => {
      active = false;
    };
  }, [fetchRows]);

  async function upload(files: FileList | File[]) {
    if (!rowId || !session.companyId) return;
    const list = Array.from(files);
    if (!multiple && list.length > 1) list.splice(1);
    setBusy(true);
    const supabase = createClient();
    for (const file of list) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(t("attachments.too_large", { mb: MAX_MB }));
        continue;
      }
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${session.companyId}/${table}/${rowId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        toast.error(upErr.message);
        continue;
      }
      const { error } = await supabase.from("attachments").insert({
        table_name: table,
        row_id: rowId,
        resource_key: resource,
        bucket,
        path,
        label: label || file.name,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        expiry_date: expiry || null,
        is_sensitive: !!sensitive,
        company_id: session.companyId,
      });
      if (error) {
        toast.error(error.message);
        await supabase.storage.from(bucket).remove([path]);
      }
    }
    setBusy(false);
    setExpiry("");
    await load();
  }

  async function open(row: AttachmentRow) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(row.bucket).createSignedUrl(row.path, 300);
    if (error || !data) {
      toast.error(error?.message ?? t("common.error"));
      return;
    }
    setPreview({ url: data.signedUrl, name: row.file_name, mime: row.mime_type });
  }

  async function remove(row: AttachmentRow) {
    const supabase = createClient();
    const { error } = await supabase.from("attachments").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.storage.from(row.bucket).remove([row.path]);
    toast.success(t("common.deleted"));
    await load();
  }

  const expected = labels ?? [];
  const uploadedLabels = new Set(rows.map((r) => r.label));

  return (
    <div className={cn("space-y-3", className)}>
      {expected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {expected.map((l) => {
            const row = rows.find((r) => r.label === l);
            const expired = row?.expiry_date ? (daysUntil(row.expiry_date) ?? 0) < 0 : false;
            return (
              <li key={l} className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs">
                <span>{l}</span>
                <StatusChip status={row ? (expired ? "expired" : "uploaded") : "missing"} />
              </li>
            );
          })}
        </ul>
      ) : null}

      {canUpload ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={t("attachments.drop")}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
          className={cn("flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground", dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}
        >
          <Upload className="size-5" aria-hidden="true" />
          <span>{busy ? t("attachments.uploading") : t("attachments.drop")}</span>
          <input ref={inputRef} type="file" className="sr-only" multiple={multiple} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
        </div>
      ) : !rowId && !readOnly ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{t("common.save")} {t("common.record").toLowerCase()} {t("common.to").toLowerCase()} {t("common.upload").toLowerCase()}.</p>
      ) : null}

      {canUpload ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {expected.length > 0 ? (
            <Select value={label} onValueChange={(v) => setLabel(v ?? "")}>
              <SelectTrigger className="h-10" aria-label={t("attachments.label")}>
                <SelectValue placeholder={t("attachments.label")} />
              </SelectTrigger>
              <SelectContent>
                {expected.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("attachments.label")} aria-label={t("attachments.label")} className="h-10" />
          )}
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label={t("attachments.expiry")} className="h-10" />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("attachments.no_files")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((r) => {
            const expired = r.expiry_date ? (daysUntil(r.expiry_date) ?? 0) < 0 : false;
            return (
              <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.file_name} · {formatDate(r.created_at)}
                    {r.expiry_date ? ` · ${t("attachments.expiry")}: ${formatDate(r.expiry_date)}` : ""}
                  </p>
                </div>
                <StatusChip status={expired ? "expired" : "uploaded"} />
                <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => open(r)} aria-label={t("attachments.preview")}>
                  <Eye />
                </Button>
                {canDelete ? (
                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="ghost" size="icon" className="size-9 text-danger" aria-label={t("attachments.remove")}>
                        <Trash2 />
                      </Button>
                    }
                    description={t("common.confirm_delete")}
                    destructive
                    confirmLabel={t("common.delete")}
                    onConfirm={() => remove(r)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {uploadedLabels.size === 0 && expected.length === 0 ? null : null}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview ? (
            preview.mime?.startsWith("image/") ? (
              <img src={preview.url} alt={preview.name} className="max-h-[70vh] w-full rounded object-contain" />
            ) : preview.mime === "application/pdf" ? (
              <iframe src={preview.url} title={preview.name} className="h-[70vh] w-full rounded border" />
            ) : (
              <a href={preview.url} target="_blank" rel="noreferrer" className="text-primary underline">
                {t("attachments.open")}
              </a>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
