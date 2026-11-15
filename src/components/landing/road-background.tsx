import Image from "next/image";

/**
 * The landing page backdrop: the highway photo with traffic, slowly drifting so the lorries seem to
 * move, lane lines running along the bottom and a flat dark tint so every word on top stays readable.
 * It sits fixed behind the whole page.
 */
export function RoadBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0b2e27]" aria-hidden="true">
      <div className="road-drift absolute -inset-[6%]">
        <Image src="/pcviewfms.jpg" alt="" fill priority sizes="100vw" className="hidden object-cover md:block" />
        <Image src="/phoneviewfms.jpg" alt="" fill sizes="100vw" className="object-cover md:hidden" />
      </div>
      {/* Lane lines rushing past along the bottom. */}
      <div className="road-lanes absolute inset-x-0 bottom-0 h-1.5 opacity-60" />
      <div className="absolute inset-0 bg-[#0b2e27]/78" />
    </div>
  );
}
