import type { Option } from "@/lib/forms/schema";

/**
 * Travel coordination: how travellers go, the terminals in Tanzania, and the fixed pickup rules
 * (how long before a departure the driver picks them up).
 */
export type TransportMode = "air" | "marine" | "railway" | "bus";

export const TRANSPORT_MODES: Option[] = [
  { value: "air", label: "travel.mode.air" },
  { value: "marine", label: "travel.mode.marine" },
  { value: "railway", label: "travel.mode.railway" },
  { value: "bus", label: "travel.mode.bus" },
];

/** Julius Nyerere International Airport (Dar es Salaam) has three terminals; its pickup is earlier. */
export const JKNIA = ["JKNIA Terminal 1 (Dar es Salaam)", "JKNIA Terminal 2 (Dar es Salaam)", "JKNIA Terminal 3 (Dar es Salaam)"];

export const TERMINALS: Record<Exclude<TransportMode, "bus">, string[]> = {
  air: [
    ...JKNIA,
    "Kilimanjaro International Airport (KIA)",
    "Abeid Amani Karume International Airport (Zanzibar)",
    "Arusha Airport",
    "Mwanza Airport",
    "Dodoma Airport",
    "Songwe Airport (Mbeya)",
    "Kigoma Airport",
    "Bukoba Airport",
    "Tabora Airport",
    "Mtwara Airport",
    "Kahama Airport",
    "Chato Airport (Geita)",
    "Musoma Airport",
    "Shinyanga Airport",
    "Iringa Airport (Nduli)",
    "Songea Airport",
    "Sumbawanga Airport",
    "Lindi Airport",
    "Tanga Airport",
    "Mafia Airport",
    "Pemba Airport",
    "Lake Manyara Airport",
    "Seronera Airstrip (Serengeti)",
    "Kilwa Masoko Airport",
  ],
  marine: ["Dar es Salaam Ferry Terminal (Dar – Zanzibar)"],
  railway: ["JPM Terminal (Dar es Salaam)", "JMK Terminal (Morogoro)", "SSH Terminal (Dodoma)"],
};

/** Terminal choices for the transport chosen (a bus terminal is typed). */
export function terminalOptions(mode: unknown): Option[] {
  const list = mode === "air" || mode === "marine" || mode === "railway" ? TERMINALS[mode] : [];
  return list.map((t) => ({ value: t, label: t }));
}

/** Hours before the departure time that the driver picks the travellers up. */
export function pickupLeadHours(mode: unknown, terminal: unknown): number {
  if (mode === "air") return JKNIA.includes(String(terminal ?? "")) || /^JKNIA\b/i.test(String(terminal ?? "")) ? 3.5 : 3;
  if (mode === "bus") return 2.5;
  return 3;
}

/** The label of the trip number for the transport: Flight No, Vessel No, Train No or Bus number. */
export function numberLabel(mode: unknown): string {
  return mode === "marine" ? "travel.no.marine" : mode === "railway" ? "travel.no.railway" : mode === "bus" ? "travel.no.bus" : "travel.no.air";
}
