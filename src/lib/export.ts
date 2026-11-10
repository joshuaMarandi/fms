"use client";

export type ExportColumn = { key: string; header: string };
export type ExportRow = Record<string, unknown>;

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(columns: ExportColumn[], rows: ExportRow[], filename: string) {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [columns.map((c) => esc(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => esc(cellText(r[c.key]))).join(","));
  download(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

export async function exportExcel(columns: ExportColumn[], rows: ExportRow[], filename: string) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c.header, typeof r[c.key] === "number" ? r[c.key] : cellText(r[c.key])])));
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.header) });
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.header.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, filename.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportPdf(columns: ExportColumn[], rows: ExportRow[], filename: string, title?: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "pt" });
  doc.setFontSize(14);
  doc.text(title ?? filename, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(85, 98, 94);
  doc.text(new Date().toLocaleString("en-GB"), 40, 56);
  autoTable(doc, {
    startY: 70,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => cellText(r[c.key]))),
    styles: { fontSize: 8, cellPadding: 4, textColor: [23, 33, 30] },
    headStyles: { fillColor: [15, 92, 77], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 243, 238] },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${filename}.pdf`);
}
