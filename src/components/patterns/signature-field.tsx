"use client";

import * as React from "react";
import { Eraser, PenLine, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/components/permissions/provider";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type SignatureValue = {
  method: "tick" | "draw";
  name: string;
  user_id: string;
  signed_at: string;
  image?: string; // data URL (PNG) when drawn
};

// The person's kept signature, loaded once per page.
const kept = new Map<string, Promise<string | null>>();
function keptSignature(userId: string) {
  let p = kept.get(userId);
  if (!p) {
    p = Promise.resolve(createClient().from("profiles").select("signature_image").eq("id", userId).maybeSingle())
      .then(({ data }) => ((data as { signature_image?: string | null } | null)?.signature_image ?? null))
      .catch(() => null);
    kept.set(userId, p);
  }
  return p;
}
// Saved a moment after the last stroke, not on every stroke.
let keepTimer: ReturnType<typeof setTimeout> | null = null;
function keepSignature(userId: string, image: string) {
  kept.set(userId, Promise.resolve(image));
  if (keepTimer) clearTimeout(keepTimer);
  keepTimer = setTimeout(() => {
    keepTimer = null;
    void createClient().rpc("save_my_signature", { p_image: image });
  }, 1200);
}

/**
 * Signature: checkbox plus name and timestamp, or a drawing canvas. Stored with user id and time.
 * The first drawing is kept for the person; after that the box is already signed with it, so they
 * only press Submit or Approve. Drawing again replaces the kept signature.
 */
export function SignatureField({
  value,
  onChange,
  disabled,
  label,
  id,
  signer,
}: {
  /** Someone else signs here: no kept signature, and the drawing is not kept as the user's. */
  signer?: { name: string | null };
  value: SignatureValue | null | undefined;
  onChange: (v: SignatureValue | null) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}) {
  const session = useSession();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const [hasInk, setHasInk] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [redraw, setRedraw] = React.useState(false);
  const filled = React.useRef(false);

  const other = !!signer;
  const signerName = signer?.name ?? "";
  const base = React.useCallback(
    () => (other ? { name: signerName, user_id: "", signed_at: new Date().toISOString() } : { name: session.fullName, user_id: session.userId, signed_at: new Date().toISOString() }),
    [other, signerName, session.fullName, session.userId],
  );

  // Sign with the kept signature when the box is empty.
  React.useEffect(() => {
    if (!session.userId || other) return;
    let active = true;
    keptSignature(session.userId).then((image) => {
      if (!active) return;
      setSaved(image);
      if (image && !value && !disabled && !filled.current) {
        filled.current = true;
        onChange({ method: "draw", ...base(), image });
      }
    });
    return () => {
      active = false;
    };
    // Only when the person or the box changes, not on every value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.userId, disabled, other]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#17211e";
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (canvasRef.current) {
      const image = canvasRef.current.toDataURL("image/png");
      onChange({ method: "draw", ...base(), image });
      // Kept for next time (the first drawing, or a new one that replaces it); not someone else's.
      if (session.userId && !other) {
        setSaved(image);
        keepSignature(session.userId, image);
      }
    }
  }
  function clear() {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  }

  if (value && disabled) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        {value.image ? <img src={value.image} alt={t("signature.title")} className="mb-2 h-16 w-auto rounded bg-white" /> : null}
        <p className="flex items-center gap-2">
          <PenLine className="size-4 text-success" aria-hidden="true" />
          {t("signature.signed", { name: value.name, time: formatDate(value.signed_at, true) })}
        </p>
      </div>
    );
  }

  // Signed with the kept signature: nothing to do but press Submit or Approve.
  if (value?.method === "draw" && value.image && value.image === saved && !redraw && !hasInk) {
    return (
      <div className="rounded-lg border p-3">
        {label ? <p className="mb-2 text-sm font-medium">{label}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
          <img src={value.image} alt={t("signature.title")} className="h-16 w-auto rounded border bg-white" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <PenLine className="size-4 text-success" aria-hidden="true" />
              {t("signature.kept")}
            </span>
            <span className="block text-xs text-muted-foreground">{t("signature.signed", { name: value.name, time: formatDate(value.signed_at, true) })}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRedraw(true);
              onChange(null);
            }}
          >
            <RotateCcw /> {t("signature.draw_new")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      {label ? <p className="mb-2 text-sm font-medium">{label}</p> : null}
      <Tabs defaultValue={value?.method === "draw" || redraw ? "draw" : "tick"}>
        <TabsList className="mb-3">
          <TabsTrigger value="tick">{t("signature.method_tick")}</TabsTrigger>
          <TabsTrigger value="draw">{t("signature.method_draw")}</TabsTrigger>
        </TabsList>
        <TabsContent value="tick">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              id={id}
              className="mt-0.5"
              disabled={disabled}
              checked={value?.method === "tick"}
              onCheckedChange={(c) => onChange(c ? { method: "tick", ...base() } : null)}
            />
            <span>
              {t("signature.tick")}
              <span className="block text-xs text-muted-foreground">
                {other ? signerName || t("signature.the_person") : session.fullName} · {formatDate(value?.signed_at ?? new Date(), true)}
              </span>
            </span>
          </label>
        </TabsContent>
        <TabsContent value="draw">
          <canvas
            ref={canvasRef}
            width={600}
            height={180}
            role="img"
            aria-label={t("signature.draw")}
            className="h-32 w-full touch-none rounded-md border bg-white"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{hasInk || value?.image ? t("signature.signed", { name: session.fullName, time: formatDate(value?.signed_at ?? new Date(), true) }) : t("common.not_signed")}</span>
            <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled}>
              <Eraser /> {t("signature.clear")}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function SignatureSummary({ value }: { value: SignatureValue | null | undefined }) {
  if (!value) return <span className="text-sm text-muted-foreground">{t("common.not_signed")}</span>;
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      {value.image ? <img src={value.image} alt="" className="h-8 w-auto rounded bg-white" /> : <PenLine className="size-4 text-success" aria-hidden="true" />}
      {t("common.signed_by", { name: value.name, date: formatDate(value.signed_at, true) })}
    </span>
  );
}
