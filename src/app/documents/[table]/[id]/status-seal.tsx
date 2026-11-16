/**
 * Rubber-stamp seal for a request document: APPROVED (green), SUBMITTED (charcoal) or REJECTED (red).
 * Drawn as vector art so it stays sharp when printed or saved as PDF: an outer double ring with the
 * company name along the top and "Fleet management" along the bottom, stars at the sides, and the
 * status on an angled banner across the middle with the date below it.
 */
const TONES = {
  approved: { color: "#0f7a3c", word: "APPROVED" },
  submitted: { color: "#3a3d3c", word: "SUBMITTED" },
  rejected: { color: "#c0141c", word: "REJECTED" },
} as const;

export type SealStatus = keyof typeof TONES;

export function sealFor(status: string): SealStatus | null {
  if (status === "approved" || status === "completed") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "submitted") return "submitted";
  return null;
}

function Star({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return <polygon points={pts} fill={color} />;
}

export function StatusSeal({ status, company, date, className }: { status: SealStatus; company: string; date?: string | null; className?: string }) {
  const { color, word } = TONES[status];
  const id = `seal-${status}`;
  // Company name without "Ltd" and the like; a long name is cut at a whole word.
  let top = company.toUpperCase().replace(/[\s,]+(LTD|LIMITED|PLC|INC|CO|COMPANY)\.?$/, "").trim();
  if (top.length > 22) top = top.slice(0, 22).replace(/\s+\S*$/, "").replace(/\s+(AND|OF|&|THE)$/, "");
  // The company name shrinks to fit the top of the ring.
  const topSize = Math.min(13, 170 / Math.max(top.length, 1));
  // Long words get a smaller banner font so they fit.
  const wordSize = word.length > 8 ? 21 : 23;
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={word} className={className} style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <defs>
        {/* Top text runs clockwise (letters face out); bottom text runs anticlockwise so it reads upright. */}
        <path id={`${id}-top`} d="M 31,100 A 69,69 0 0 1 169,100" />
        <path id={`${id}-bottom`} d="M 21,100 A 79,79 0 0 0 179,100" />
        {/* Worn ink: small gaps scattered over the stamp. */}
        <filter id={`${id}-worn`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5 3.9" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id}-worn)`}>
        <circle cx="100" cy="100" r="95" fill="none" stroke={color} strokeWidth="5" />
        <circle cx="100" cy="100" r="87" fill="none" stroke={color} strokeWidth="1.6" />
        <circle cx="100" cy="100" r="55" fill="none" stroke={color} strokeWidth="1.6" />
        <circle cx="100" cy="100" r="50" fill="none" stroke={color} strokeWidth="1" />
        <text fill={color} fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize={topSize.toFixed(1)} letterSpacing="0.8">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
            {top}
          </textPath>
        </text>
        <text fill={color} fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize="11.5" letterSpacing="1.2">
          <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">
            FLEET MANAGEMENT
          </textPath>
        </text>
        <Star cx={19} cy={100} r={6} color={color} />
        <Star cx={181} cy={100} r={6} color={color} />
        <Star cx={84} cy={66} r={4.5} color={color} />
        <Star cx={100} cy={61} r={5.5} color={color} />
        <Star cx={116} cy={66} r={4.5} color={color} />
        <g transform="rotate(-14 100 100)">
          <rect x="16" y="84" width="168" height="34" rx="5" fill={color} />
          <rect x="20" y="88" width="160" height="26" rx="3" fill="none" stroke="#ffffff" strokeWidth="1.3" />
          <text x="100" y="108.5" textAnchor="middle" fill="#ffffff" fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize={wordSize} letterSpacing="1.5">
            {word}
          </text>
        </g>
        {date ? (
          <text x="100" y="138" textAnchor="middle" fill={color} fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="9.5" letterSpacing="0.5">
            {date}
          </text>
        ) : null}
      </g>
    </svg>
  );
}
