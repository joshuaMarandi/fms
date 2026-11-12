/**
 * Flat accent tones for cards and icon tiles (no gradients). Class names are written out in full
 * so Tailwind picks them up.
 */
export type Tone = "green" | "blue" | "amber" | "red" | "purple" | "slate";

export const TONE: Record<Tone, { tile: string; bar: string; text: string; ring: string }> = {
  green: { tile: "bg-[#ddefe7] text-[#0f5c4d]", bar: "bg-[#0f5c4d]", text: "text-[#0f5c4d]", ring: "hover:ring-[#0f5c4d]/50" },
  blue: { tile: "bg-[#deedf5] text-[#1f5f80]", bar: "bg-[#2e7da6]", text: "text-[#1f5f80]", ring: "hover:ring-[#2e7da6]/50" },
  amber: { tile: "bg-[#fbefd5] text-[#6b4300]", bar: "bg-[#d98b1f]", text: "text-[#6b4300]", ring: "hover:ring-[#d98b1f]/60" },
  red: { tile: "bg-[#f9e1de] text-[#8a1c12]", bar: "bg-[#b3261e]", text: "text-[#8a1c12]", ring: "hover:ring-[#b3261e]/50" },
  purple: { tile: "bg-[#ebe7f3] text-[#4f4275]", bar: "bg-[#6b5b95]", text: "text-[#4f4275]", ring: "hover:ring-[#6b5b95]/50" },
  slate: { tile: "bg-[#e8e7e1] text-[#3f4a46]", bar: "bg-[#7a8a83]", text: "text-[#3f4a46]", ring: "hover:ring-[#7a8a83]/60" },
};

/** Shared hover treatment for a card that is a link. */
export const CLICKABLE_CARD = "cursor-pointer transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
