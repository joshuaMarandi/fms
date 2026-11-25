"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/components/permissions/provider";
import { exportCsv, exportExcel, exportPdf, type ExportColumn, type ExportRow } from "@/lib/export";
import { t } from "@/i18n";

/** Export a small table shown outside a list (for example a petty cash request's transactions). */
export function ExportMenu({ columns, rows, filename, title, subtitle }: { columns: ExportColumn[]; rows: ExportRow[]; filename: string; title: string; subtitle?: string }) {
  const { session } = usePermissions();
  async function run(kind: "csv" | "xlsx" | "pdf") {
    if (kind === "csv") return exportCsv(columns, rows, filename);
    const ctx = { brand: session.brand, printedBy: session.fullName, subtitle };
    if (kind === "xlsx") await exportExcel(columns, rows, filename, title, ctx);
    else await exportPdf(columns, rows, filename, title, ctx);
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-10" disabled={rows.length === 0}>
          <Download /> {t("common.export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run("csv")}>{t("common.export_csv")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("xlsx")}>{t("common.export_excel")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("pdf")}>{t("common.export_pdf")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
