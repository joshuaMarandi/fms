import "server-only";
import { headers } from "next/headers";

/** Public base URL for links in emails: NEXT_PUBLIC_APP_URL, else the current request's host. */
export async function appUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Link that lands on /auth/callback, which verifies the one-time token and signs the user in. */
export function authLink(base: string, hashedToken: string, type: "invite" | "recovery") {
  const u = new URL("/auth/callback", base);
  u.searchParams.set("token_hash", hashedToken);
  u.searchParams.set("type", type);
  u.searchParams.set("next", "/reset-password");
  return u.toString();
}
