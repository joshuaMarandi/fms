import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeContent, templateDef, type TemplateContent } from "./registry";

/** Saved wording for a template: default, then the platform default, then the company's own. */
const cache = new Map<string, { at: number; content: TemplateContent }>();
const TTL = 60_000;

export function clearTemplateCache() {
  cache.clear();
}

export async function loadTemplateContent(key: string, companyId: string | null): Promise<TemplateContent> {
  const def = templateDef(key);
  const cacheKey = `${key}|${companyId ?? ""}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.content;

  let platform: TemplateContent | null = null;
  let company: TemplateContent | null = null;
  try {
    const admin = createAdminClient();
    let q = admin.from("message_templates").select("company_id, content").eq("key", key);
    const validCompany = companyId && /^[0-9a-f-]{36}$/i.test(companyId) ? companyId : null;
    q = validCompany && def.scope === "company" ? q.or(`company_id.is.null,company_id.eq.${validCompany}`) : q.is("company_id", null);
    const { data } = await q;
    for (const row of (data ?? []) as { company_id: string | null; content: TemplateContent }[]) {
      if (row.company_id) company = row.content;
      else platform = row.content;
    }
  } catch (e) {
    // Without the database (or before migration 14) the default wording is used.
    console.error("[templates]", (e as Error).message);
  }
  const content = mergeContent(def, platform, company);
  cache.set(cacheKey, { at: Date.now(), content });
  return content;
}
