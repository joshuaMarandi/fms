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
      list.push({ id: d.id, label: d.label, file_name: d.file_name, mime_type: d.mime_type, bucket: d.bucket, path: d.path, expiry_date: d.expiry_date, created_at: (d as { created_at?: string }).created_at ?? null });
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

/**
 * Files kept on the vehicle (for example a mobilization report uploaded with the vehicle) matched
 * to its records by date: each file goes to the newest record dated on or before the day it was
 * uploaded (or the oldest record when it came before all of them).
 */
export function assignByDate(rows: { id: string; date: string | null }[], docs: DocRef[]): Map<string, DocRef[]> {
  const out = new Map<string, DocRef[]>();
  const dated = rows.filter((r) => r.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (dated.length === 0) return out;
  for (const d of docs) {
    const day = (d.created_at ?? "").slice(0, 10);
    const target = [...dated].reverse().find((r) => day && String(r.date) <= day) ?? dated[0]!;
    out.set(target.id, [...(out.get(target.id) ?? []), d]);
  }
  return out;
}

/** Files of one type kept on vehicles, by vehicle id. */
export async function loadVehicleDocs(vehicleIds: string[], label: string): Promise<Map<string, DocRef[]>> {
  const all = await loadDocs("vehicles", vehicleIds);
  const want = label.toLowerCase();
  const out = new Map<string, DocRef[]>();
  for (const [vid, docs] of all) {
    const match = docs.filter((d) => d.label.toLowerCase() === want);
    if (match.length) out.set(vid, match);
  }
  return out;
}
