"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/permissions/provider";
import { brandLines, SYSTEM_NAME } from "@/lib/branding";
import { t } from "@/i18n";

const stamp = () => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());

/**
 * Letterhead and footer that exist only on paper (window.print): company logo and details at the top,
 * and a small grey line at the bottom of every page with who printed it, when, and from which system.
 */
export function PrintFrame() {
  const session = useSession();
  const brand = session.brand;
  const [printedAt, setPrintedAt] = React.useState("");

  React.useEffect(() => {
    const update = () => setPrintedAt(stamp());
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);

  return (
    <>
      <div className="print-only print-letterhead" aria-hidden="true">
        <div className="print-letterhead-bar" />
        <div className="print-letterhead-row">
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- printed letterhead
            <img src={brand.logoUrl} alt="" className="print-logo" />
          ) : null}
          <div className="print-company">
            <p className="print-company-name">{brand?.name ?? SYSTEM_NAME}</p>
            {brandLines(brand).map((line) => (
              <p key={line} className="print-company-line">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="print-rule" />
      </div>
      <div className="print-only print-footer" aria-hidden="true">
        <span>{t("doc.printed_by", { name: session.fullName, date: printedAt || stamp() })}</span>
        <span>{t("doc.generated_by", { system: SYSTEM_NAME })}</span>
      </div>
    </>
  );
}

export function PrintButton({ className }: { className?: string }) {
  return (
    <Button type="button" variant="outline" className={className ?? "h-10 no-print"} onClick={() => window.print()}>
      <Printer /> {t("doc.print")}
    </Button>
  );
}
