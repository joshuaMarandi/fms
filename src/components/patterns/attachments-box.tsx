"use client";

import * as React from "react";
import { Download, Eye, FileText, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
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

type Pending = { key: string; file: File; label: string; expiry: string };

const MAX_MB = 20;
const OTHER = "__other__";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Documents for a record.
 * Choose or drop files first; a dialog then asks for each file's document type and expiry date.
 * Clicking a missing document type opens the file picker for exactly that type.
 * Files open inside the app (images and PDFs) by downloading them through the app's own
 * Supabase connection, so they show even when storage links point at an internal address.
 */
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
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [presetLabel, setPresetLabel] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [preview, setPreview] = React.useState<{ row: AttachmentRow; url: string | null; loading: boolean } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const expected = React.useMemo(() => labels ?? [], [labels]);
  const canUpload = !readOnly && !!rowId && (can(resource, "edit") || can(resource, "create"));
  const canDelete = !readOnly && can(resource, "delete");

  const fetchRows = React.useCallback(async (): Promise<AttachmentRow[]> => {
    if (!rowId) return [];
    const supabase = createClient();
    const { data } = await supabase
      .from("attachments")
      .select("id, label, file_name, mime_type, size_bytes, expiry_date, bucket, path, created_at")
      .eq("table_name", table)
      .eq("row_id", rowId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
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

  // Free the in-memory file when the preview closes.
  React.useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview?.url]);

  const uploadedLabels = new Set(rows.map((r) => r.label));

  function pick(label: string | null) {
    setPresetLabel(label);
    inputRef.current?.click();
  }

  /** Files chosen or dropped: ask for type and expiry before uploading. */
  function stage(files: FileList | File[]) {
    let list = Array.from(files);
    if (!multiple) list = list.slice(0, 1);
    const tooBig = list.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig.length) toast.error(t("attachments.too_large", { mb: MAX_MB }));
    list = list.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    if (!list.length) return;
    const taken = new Set(uploadedLabels);
    setPending(
      list.map((file, i) => {
        let label = presetLabel ?? "";
        if (!label && expected.length) {
          label = expected.find((l) => !taken.has(l)) ?? expected[0]!;
          taken.add(label);
        }
        if (!label) label = file.name.replace(/\.[^.]+$/, "");
        return { key: `${Date.now()}-${i}`, file, label, expiry: "" };
      }),
    );
    setPresetLabel(null);
  }

  async function uploadAll() {
    if (!rowId || !session.companyId) return;
    if (pending.some((p) => !p.label.trim())) {
      toast.error(t("attachments.choose_type"));
      return;
    }
    setBusy(true);
    const supabase = createClient();
    let ok = 0;
    for (const p of pending) {
      const safeName = p.file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${session.companyId}/${table}/${rowId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, p.file, { contentType: p.file.type || undefined, upsert: false });
      if (upErr) {
        toast.error(`${p.file.name}: ${upErr.message}`);
        continue;
      }
      const { error } = await supabase.from("attachments").insert({
        table_name: table,
        row_id: rowId,
        resource_key: resource,
        bucket,
        path,
        label: p.label.trim(),
        file_name: p.file.name,
        mime_type: p.file.type || null,
        size_bytes: p.file.size,
        expiry_date: p.expiry || null,
        is_sensitive: !!sensitive,
        company_id: session.companyId,
      });
      if (error) {
        toast.error(`${p.file.name}: ${error.message}`);
        await supabase.storage.from(bucket).remove([path]);
        continue;
      }
      ok++;
    }
    setBusy(false);
    if (ok) toast.success(t("attachments.uploaded_count", { count: ok }));
    setPending([]);
    await load();
  }

  async function open(row: AttachmentRow) {
    setPreview({ row, url: null, loading: true });
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(row.bucket).download(row.path);
    if (error || !data) {
      setPreview(null);
      toast.error(error?.message ?? t("attachments.open_failed"));
      return;
    }
    const blob = row.mime_type && data.type !== row.mime_type ? new Blob([data], { type: row.mime_type }) : data;
    setPreview({ row, url: URL.createObjectURL(blob), loading: false });
  }

  async function download(row: AttachmentRow) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(row.bucket).download(row.path);
    if (error || !data) {
      toast.error(error?.message ?? t("attachments.open_failed"));
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = row.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  const isImage = (m: string | null) => !!m && m.startsWith("image/");
  const isPdf = (m: string | null) => m === "application/pdf";

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        multiple={multiple && !presetLabel}
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
        onChange={(e) => {
          if (e.target.files?.length) stage(e.target.files);
          e.target.value = "";
        }}
      />

      {expected.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {expected.map((l) => {
            const row = rows.find((r) => r.label === l);
            const expired = row?.expiry_date ? (daysUntil(row.expiry_date) ?? 0) < 0 : false;
            return (
              <li key={l} className="flex min-h-[48px] items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l}</span>
                <StatusChip status={row ? (expired ? "expired" : "uploaded") : "missing"} />
                {row ? (
                  <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => open(row)} aria-label={`${t("attachments.preview")}: ${l}`}>
                    <Eye />
                  </Button>
                ) : canUpload ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => pick(l)}>
                    <Plus /> {t("common.upload")}
                  </Button>
                ) : null}
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
          onClick={() => pick(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") pick(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) stage(e.dataTransfer.files);
          }}
          className={cn(
            "flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground",
            dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
          )}
        >
          <Upload className="size-5" aria-hidden="true" />
          <span className="font-medium text-foreground">{busy ? t("attachments.uploading") : t("attachments.drop")}</span>
          <span className="text-xs">{t("attachments.drop_hint", { mb: MAX_MB })}</span>
        </div>
      ) : !rowId && !readOnly ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{t("attachments.save_first")}</p>
      ) : null}

      {rows.length === 0 ? (
        expected.length === 0 ? <p className="text-sm text-muted-foreground">{t("attachments.no_files")}</p> : null
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((r) => {
            const expired = r.expiry_date ? (daysUntil(r.expiry_date) ?? 0) < 0 : false;
            return (
              <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
                <button type="button" onClick={() => open(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.file_name} · {formatSize(r.size_bytes)} · {formatDate(r.created_at)}
                      {r.expiry_date ? ` · ${t("attachments.expiry")}: ${formatDate(r.expiry_date)}` : ""}
                    </span>
                  </span>
                </button>
                <StatusChip status={expired ? "expired" : "uploaded"} />
                <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => download(r)} aria-label={t("common.download")}>
                  <Download />
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

      {/* Step 2: type and expiry for each chosen file */}
      <Dialog open={pending.length > 0} onOpenChange={(o) => !o && !busy && setPending([])}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pending.length === 1 ? t("attachments.confirm_title_one") : t("attachments.confirm_title", { count: pending.length })}</DialogTitle>
            <DialogDescription>{t("attachments.confirm_description")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto">
            {pending.map((p, i) => {
              const isOther = expected.length > 0 && !expected.includes(p.label);
              const update = (patch: Partial<Pending>) => setPending((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={p.key} className="space-y-3 rounded-lg border p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{p.file.name}</span>
                    <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{formatSize(p.file.size)}</span>
                  </p>
                  <Field>
                    <FieldLabel htmlFor={`att-type-${p.key}`}>{t("attachments.label")}</FieldLabel>
                    {expected.length > 0 ? (
                      <Select value={isOther ? OTHER : p.label} onValueChange={(v) => update({ label: v === OTHER ? "" : (v ?? "") })}>
                        <SelectTrigger id={`att-type-${p.key}`} className="h-10 w-full">
                          <SelectValue placeholder={t("attachments.choose_type")} />
                        </SelectTrigger>
                        <SelectContent>
                          {expected.map((l) => (
                            <SelectItem key={l} value={l}>
                              {l}
                              {uploadedLabels.has(l) ? ` (${t("attachments.replace_hint")})` : ""}
                            </SelectItem>
                          ))}
                          <SelectItem value={OTHER}>{t("common.other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                    {expected.length === 0 || isOther ? (
                      <Input id={expected.length ? undefined : `att-type-${p.key}`} className="h-10" value={p.label} placeholder={t("attachments.type_placeholder")} onChange={(e) => update({ label: e.target.value })} />
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`att-exp-${p.key}`}>
                      {t("attachments.expiry")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                    </FieldLabel>
                    <Input id={`att-exp-${p.key}`} type="date" className="h-10" value={p.expiry} onChange={(e) => update({ expiry: e.target.value })} />
                  </Field>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending([])} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={uploadAll} disabled={busy}>
              <Upload /> {busy ? t("attachments.uploading") : t("common.upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Viewer */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.row.label}</DialogTitle>
            <DialogDescription className="truncate">{preview?.row.file_name}</DialogDescription>
          </DialogHeader>
          {preview?.loading ? (
            <Skeleton className="h-[60vh] w-full" />
          ) : preview?.url ? (
            isImage(preview.row.mime_type) ? (
              // eslint-disable-next-line @next/next/no-img-element -- in-memory blob, not optimisable
              <img src={preview.url} alt={preview.row.label} className="max-h-[70vh] w-full rounded object-contain" />
            ) : isPdf(preview.row.mime_type) ? (
              <object data={preview.url} type="application/pdf" className="h-[70vh] w-full rounded border">
                <p className="p-6 text-center text-sm text-muted-foreground">{t("attachments.no_inline_preview")}</p>
              </object>
            ) : (
              <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">{t("attachments.no_inline_preview")}</p>
            )
          ) : null}
          {preview && !preview.loading ? (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => download(preview.row)}>
                <Download /> {t("common.download")}
              </Button>
              {preview.url ? (
                <Button type="button" asChild>
                  <a href={preview.url} target="_blank" rel="noreferrer">
                    {t("attachments.open")}
                  </a>
                </Button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
