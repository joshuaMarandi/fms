import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Server only: the key bypasses RLS, so it is read from a
 * non-public env var and this module refuses to be bundled for the browser.
 * Use it only for the Auth admin API and writes the caller's own RLS cannot do,
 * after the caller's permission has been checked with their own client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (never with a NEXT_PUBLIC_ prefix).");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
