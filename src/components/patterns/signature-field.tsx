"use client";

import * as React from "react";
import { Eraser, PenLine } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/components/permissions/provider";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type SignatureValue = {
  method: "tick" | "draw";
  name: string;
  user_id: string;
  signed_at: string;
  image?: string; // data URL (PNG) when drawn
};

/** Signature: checkbox plus name and timestamp, or a drawing canvas. Stored with user id and time. */
export function SignatureField({
  value,
  onChange,
  disabled,
  label,
  id,
}: {
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

  const base = () => ({ name: session.fullName, user_id: session.userId, signed_at: new Date().toISOString() });

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
      onChange({ method: "draw", ...base(), image: canvasRef.current.toDataURL("image/png") });
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

  return (
    <div className="rounded-lg border p-3">
      {label ? <p className="mb-2 text-sm font-medium">{label}</p> : null}
      <Tabs defaultValue={value?.method === "draw" ? "draw" : "tick"}>
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
                {session.fullName} · {formatDate(value?.signed_at ?? new Date(), true)}
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
