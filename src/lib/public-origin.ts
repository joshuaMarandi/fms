import type { NextRequest } from "next/server";

/**
 * The address users see in the browser (https://fms.mdvfleet.co.tz), not the internal one the
 * app listens on behind nginx (http://127.0.0.1:3111). Order: NEXT_PUBLIC_APP_URL, then the
 * proxy's forwarded host and protocol, then the request itself.
 */
export function publicOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    return `${proto}://${host}`;
  }
  return request.nextUrl.origin;
}

/** Absolute URL on the public origin for a path such as "/login?next=/fleet". */
export function publicUrl(request: NextRequest, pathAndQuery: string): URL {
  return new URL(pathAndQuery, publicOrigin(request) + "/");
}
