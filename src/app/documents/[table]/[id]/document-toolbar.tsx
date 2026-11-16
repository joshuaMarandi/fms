"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Back to the request and Print / Save as PDF. Not printed. */
export function DocumentToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[210mm] items-center justify-between gap-2 px-4 print:hidden">
      <Button asChild variant="outline" className="h-10 bg-white">
        <Link href={backHref}>
          <ArrowLeft /> {t("doc.back_to_request")}
        </Link>
      </Button>
      <Button type="button" className="h-10" onClick={() => window.print()}>
        <Printer /> {t("doc.print_or_pdf")}
      </Button>
    </div>
  );
}
