import { createClient } from "@/lib/supabase/server";
import type { DocRef } from "@/components/patterns/doc-button";

const SELECT = "id, label, file_name, mime_type, bucket, path, expiry_date, row_id, created_at";

/** Documents attached to many rows of one table, by row id (newest first). */
export async function loadDocs(table: string, rowIds: string[]): Promise<Map<string, DocRef[]>> {
  const out = new Map<string, DocRef[]>();
  const ids = [...new Set(rowIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const supabase = await createClient();
  // Keep each request URL short: ids go in chunks.
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.from("attachments").select(SELECT).eq("table_name", table).in("row_id", ids.slice(i, i + 150)).is("deleted_at", null).order("created_at", { ascending: false });
    for (const d of (data ?? []) as (DocRef & { row_id: string })[]) {
      const list = out.get(d.row_id) ?? [];
      list.push({ id: d.id, label: d.label, file_name: d.file_name, mime_type: d.mime_type, bucket: d.bucket, path: d.path, expiry_date: d.expiry_date });
      out.set(d.row_id, list);
    }
  }
  return out;
}

/** Documents of one row with one of the given labels (for example the vehicle's insurance policy). */
export async function loadDocsByLabel(table: string, rowId: string, labels: string[]): Promise<DocRef[]> {
  const all = (await loadDocs(table, [rowId])).get(rowId) ?? [];
  const want = new Set(labels.map((l) => l.toLowerCase()));
  return all.filter((d) => want.has(d.label.toLowerCase()));
}
