"use client";

import * as React from "react";
import { CheckCircle2, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmByLink } from "./actions";

/** Type your name, tick, draw your signature: the driver's confirmation of a request made for them. */
export function ConfirmForm({ token, driverName, timesheet }: { token: string; driverName: string; timesheet?: boolean }) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const [name, setName] = React.useState(driverName);
  const [agree, setAgree] = React.useState(false);
  const [drawn, setDrawn] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#17211e";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
    canvas.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDrawn(true);
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  };

  async function submit() {
    setError(null);
    if (!agree) return setError("Tick the box to confirm.");
    setBusy(true);
    const res = await confirmByLink(token, { name, image: drawn ? canvas.current!.toDataURL("image/png") : null });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setDone(true);
  }

  if (done) {
    return (
      <div className="flex gap-3 rounded-lg border border-success/40 bg-success-bg p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="font-medium text-success">{timesheet ? "Thank you, your timesheet is signed." : "Thank you, the request is confirmed."}</p>
          <p className="mt-1 text-sm text-muted-foreground">{timesheet ? "It now goes to the fleet manager, then the HOD, for approval." : "Your signature is kept with the request. It can now go for approval."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="c-name">Your full name</Label>
        <Input id="c-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Your signature</Label>
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!drawn}>
            <Eraser /> Clear
          </Button>
        </div>
        <canvas
          ref={canvas}
          width={600}
          height={200}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="h-40 w-full touch-none rounded-lg border-2 border-dashed bg-white"
          aria-label="Draw your signature here"
        />
      </div>
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
        <span>{timesheet ? "I confirm that these are the days and hours I worked this month. I sign it electronically." : "I confirm that this request was made for me and that the details are correct. I sign it electronically."}</span>
      </label>
      {error ? <p className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
      <Button type="button" className="h-11 w-full" onClick={submit} disabled={busy}>
        {busy ? "Saving…" : "Confirm and sign"}
      </Button>
    </div>
  );
}
