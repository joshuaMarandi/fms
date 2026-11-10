"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/i18n";

const MAX_SIDE = 400;

/** Resize to at most 400 px on the longest side and return a PNG (keeps transparency) data URL. */
async function resize(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("bad image"));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Company logo: shown in the sidebar for everyone in the company and in the header of every document. */
export function LogoField({ companyId, logoUrl, readOnly }: { companyId: string; logoUrl: string | null; readOnly: boolean }) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(logoUrl);
  const [busy, setBusy] = React.useState(false);

  async function save(dataUrl: string | null) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("companies").update({ logo_data: dataUrl }).eq("id", companyId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(dataUrl ? t("settings.company.logo_saved") : t("settings.company.logo_removed"));
    router.refresh();
    return true;
  }

  async function onFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(t("settings.company.logo_type"));
      return;
    }
    try {
      const dataUrl = await resize(file);
      if (await save(dataUrl)) setPreview(dataUrl);
    } catch {
      toast.error(t("settings.company.logo_type"));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border bg-white">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL or our logo API
          <img src={preview} alt={t("settings.company.logo")} className="max-h-full max-w-full object-contain p-2" />
        ) : (
          <ImageUp className="size-8 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("settings.company.logo_hint")}</p>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              <ImageUp /> {preview ? t("settings.company.logo_change") : t("settings.company.logo_upload")}
            </Button>
            {preview ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                disabled={busy}
                onClick={async () => {
                  if (await save(null)) setPreview(null);
                }}
              >
                <Trash2 /> {t("settings.company.logo_remove")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
