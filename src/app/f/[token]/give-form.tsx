"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Finance records the money given and uploads the proof of payment (from the email link). */
export function GiveForm({ token, amount }: { token: string; amount: number }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/f/${token}/give`, { method: "POST", body: new FormData(e.currentTarget) });
      const body = (await res.json().catch(() => ({ ok: false, error: "It could not be saved. Try again." }))) as { ok: boolean; error?: string };
      if (!body.ok) setError(body.error ?? "It could not be saved. Try again.");
      else setDone(true);
    } catch {
      setError("No connection. Check the internet and try again.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="flex gap-3 rounded-lg bg-success-bg p-4 text-success" role="status">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">Thank you, the payment is recorded.</p>
          <p className="mt-1 text-sm text-muted-foreground">The proof of payment is kept with the request, and the person who asked for the money was told.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="give-amount">Amount given (TZS)</Label>
          <Input id="give-amount" name="amount" inputMode="decimal" className="h-11" defaultValue={String(amount)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="give-name">Your full name</Label>
          <Input id="give-name" name="given_by" autoComplete="name" className="h-11" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="give-proof">Proof of payment</Label>
        <Input id="give-proof" name="proof" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="h-11" required />
        <p className="text-xs text-muted-foreground">A PDF or a photo of the receipt, transfer or mobile money message. Up to 10 MB.</p>
      </div>
      {error ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Record the payment"}
      </Button>
    </form>
  );
}
