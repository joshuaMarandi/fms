"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A card that sits like a raised slab and leans a little toward the pointer. Flat colours only:
 * the depth comes from a solid edge below the card and a soft drop shadow. Still for reduced motion
 * and on touch screens.
 */
export function TiltCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLElement>(null);
  const frame = React.useRef<number | null>(null);

  const reset = () => {
    if (ref.current) ref.current.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
  };

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(1200px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
    });
  };

  return (
    <section
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={cn(
        "rounded-2xl border border-white/70 bg-[#e9efeb] transition-transform duration-200 ease-out will-change-transform",
        "shadow-[0_10px_0_0_#0a2b24,0_34px_60px_-18px_rgba(0,0,0,0.65)]",
        className,
      )}
    >
      {children}
    </section>
  );
}
