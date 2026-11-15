"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BellRing, Gauge, MailCheck, ShieldCheck, Smartphone, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// three.js loads only in the browser, after the page text is already on screen.
const Car3D = dynamic(() => import("./car-3d").then((m) => m.Car3D), { ssr: false, loading: () => <CarPlaceholder /> });

/** A few sample rows of the step's screen. Cells starting with ok:, warn: or bad: show as chips. */
export type StorySample = { title: string; columns: string[]; rows: string[][] };
export type StoryStep = { tag: string; title: string; body: string; points: string[]; sample?: StorySample };

const CHIP: Record<string, string> = {
  ok: "bg-[#ddefe7] text-[#0b4a3d]",
  warn: "bg-[#fbefd5] text-[#6b4300]",
  bad: "bg-[#f9e1de] text-[#8a1c12]",
};

function SampleCell({ value }: { value: string }) {
  const m = /^(ok|warn|bad):(.*)$/.exec(value);
  if (!m) return <>{value}</>;
  return <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", CHIP[m[1]!])}>{m[2]}</span>;
}

/** See-through card with sample rows, laid over the turning car. */
function SampleCard({ sample, on }: { sample: StorySample; on: boolean }) {
  return (
    <div
      aria-hidden={!on}
      className={cn(
        "absolute inset-x-0 bottom-0 transition-all duration-500 ease-out md:inset-x-6 md:bottom-2",
        on ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0",
      )}
    >
      <div className="overflow-hidden rounded-xl border border-white/20 bg-[#0b2e27]/55 text-white shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-2 border-b border-white/15 px-3 py-2">
          <span className="flex gap-1" aria-hidden="true">
            <span className="size-2 rounded-full bg-[#d98b1f]" />
            <span className="size-2 rounded-full bg-white/40" />
            <span className="size-2 rounded-full bg-white/40" />
          </span>
          <span className="truncate text-xs font-semibold tracking-wide text-white/90">{sample.title}</span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] tracking-wide text-[#7fc3b2] uppercase">
            <tr>
              {sample.columns.map((c) => (
                <th key={c} scope="col" className="px-3 py-1.5 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {sample.rows.map((r, i) => (
              <tr key={i} className={cn(i > 1 && "hidden sm:table-row")}>
                {r.map((cell, k) => (
                  <td key={k} className={cn("px-3 py-1.5 align-middle", k === 0 ? "font-semibold whitespace-nowrap" : "text-white/85")}>
                    <SampleCell value={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STEP_ICONS = [Truck, ShieldCheck, Gauge, MailCheck];
const HIGHLIGHT_ICONS = [MailCheck, BellRing, Smartphone];

function CarPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
      <span className="size-40 animate-pulse rounded-full border-4 border-[#1b5a4c]" />
    </div>
  );
}

/**
 * Landing hero as a scroll story: the stage stays on screen while the page scrolls; the car turns
 * once around and the text moves through the steps. Step 0 is the hero (title and buttons).
 */
export function LandingStory({
  title,
  subtitle,
  mainHref,
  mainLabel,
  secondHref,
  secondLabel,
  highlights,
  steps,
  scrollHint,
}: {
  title: string;
  subtitle: string;
  mainHref: string;
  mainLabel: string;
  secondHref: string;
  secondLabel: string;
  highlights: string[];
  steps: StoryStep[];
  scrollHint: string;
}) {
  const section = React.useRef<HTMLElement>(null);
  const progress = React.useRef(0);
  const [active, setActive] = React.useState(0);
  const total = steps.length + 1;
  // Which car is on the turntable for each step: saloon, saloon, SUV, SUV, grand tourer.
  const carIndex = React.useRef(0);
  // The stretch of the story each car is on the turntable for (saloon, SUV, grand tourer).
  const segments = React.useMemo(() => {
    const out: [number, number][] = [];
    for (let car = 0; car < 3; car++) {
      const steps = Array.from({ length: total }, (_, s) => s).filter((s) => Math.min(2, Math.floor((s * 3) / total)) === car);
      out.push([steps[0]! / total, (steps[steps.length - 1]! + 1) / total]);
    }
    return out;
  }, [total]);
  React.useEffect(() => {
    carIndex.current = Math.min(2, Math.floor((active * 3) / total));
  }, [active, total]);

  React.useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const run = el.offsetHeight - window.innerHeight;
      const p = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 0;
      progress.current = p;
      const step = Math.min(total - 1, Math.floor(p * total * 0.999));
      setActive((s) => (s === step ? s : step));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [total]);

  const goTo = (i: number) => {
    const el = section.current;
    if (!el) return;
    const run = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (run * (i + 0.5)) / total, behavior: "smooth" });
  };

  return (
    <section ref={section} aria-label={title} className="relative text-sidebar-foreground" style={{ height: `${total * 90 + 10}svh` }}>
      <div className="sticky top-16 h-[calc(100svh-4rem)] overflow-hidden">
        <div className="relative mx-auto grid h-full max-w-6xl grid-cols-1 grid-rows-[minmax(0,42%)_minmax(0,1fr)] gap-2 px-4 md:grid-cols-2 md:grid-rows-1 md:items-center md:gap-8 md:px-6">
          {/* The car: right on wide screens, on top on phones. */}
          <div className="relative order-first h-full min-h-0 min-w-0 md:order-last md:h-[min(80%,560px)]">
            <Car3D
              progress={progress}
              carIndex={carIndex}
              segments={segments}
              raiseFrom={1 / total}
              className="h-full w-full"
              fallback={
                <div className="relative h-full w-full overflow-hidden rounded-xl border-4 border-white/10">
                  <Image src="/pcviewfms.jpg" alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
                </div>
              }
            />
            {steps.map((st, i) => (st.sample ? <SampleCard key={i} sample={st.sample} on={active === i + 1} /> : null))}
          </div>

          {/* The text: one step at a time. */}
          <div className="relative min-h-0 min-w-0 md:h-[min(80%,560px)]">
            {[0, ...steps.map((_, i) => i + 1)].map((i) => {
              const on = active === i;
              return (
                <div
                  key={i}
                  aria-hidden={!on}
                  className={cn("absolute inset-0 flex flex-col justify-start transition-all duration-500 ease-out md:justify-center", on ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0")}
                >
                  {i === 0 ? (
                    <div>
                      <h1 className="text-3xl leading-tight font-semibold text-white md:text-5xl">{title}</h1>
                      <p className="mt-4 max-w-xl text-base leading-relaxed opacity-90 md:text-lg">{subtitle}</p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <Button asChild size="lg" className="h-12 bg-[#d98b1f] px-6 text-base text-[#2a1b00] shadow-[0_4px_0_0_#8a5410] hover:bg-[#e69c33] active:translate-y-[4px] active:shadow-none">
                          <Link href={mainHref} tabIndex={on ? 0 : -1}>
                            {mainLabel} <ArrowRight />
                          </Link>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="h-12 border-sidebar-foreground/40 bg-transparent px-6 text-base text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                          <Link href={secondHref} tabIndex={on ? 0 : -1}>
                            {secondLabel}
                          </Link>
                        </Button>
                      </div>
                      <ul className="mt-6 hidden flex-wrap gap-2 sm:flex">
                        {highlights.map((h, k) => {
                          const Icon = HIGHLIGHT_ICONS[k % HIGHLIGHT_ICONS.length]!;
                          return (
                            <li key={h} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm">
                              <Icon className="size-4 text-[#7fc3b2]" aria-hidden="true" /> {h}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    (() => {
                      const s = steps[i - 1]!;
                      const Icon = STEP_ICONS[(i - 1) % STEP_ICONS.length]!;
                      return (
                        <div>
                          <p className="flex items-center gap-3 text-sm font-semibold tracking-wide text-[#7fc3b2] uppercase">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-[#d98b1f] text-[#2a1b00]">
                              <Icon className="size-5" aria-hidden="true" />
                            </span>
                            <span className="tabular-nums">0{i}</span>
                            <span>{s.tag}</span>
                          </p>
                          <h2 className="mt-4 text-3xl leading-tight font-semibold text-white md:text-4xl">{s.title}</h2>
                          <p className="mt-3 max-w-lg text-base leading-relaxed opacity-90">{s.body}</p>
                          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                            {s.points.map((pt) => (
                              <li key={pt} className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm">
                                <span className="size-1.5 shrink-0 rounded-full bg-[#d98b1f]" aria-hidden="true" /> {pt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Where you are in the story; each dot jumps to its step. */}
        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={i === 0 ? title : steps[i - 1]!.tag}
              aria-current={active === i ? "step" : undefined}
              className={cn("h-2.5 rounded-full transition-all duration-300", active === i ? "w-8 bg-[#d98b1f]" : "w-2.5 bg-white/35 hover:bg-white/60")}
            />
          ))}
          <span className={cn("ml-2 hidden text-xs text-white/70 transition-opacity md:inline", active === 0 ? "opacity-100" : "opacity-0")}>{scrollHint}</span>
        </div>
      </div>
    </section>
  );
}
