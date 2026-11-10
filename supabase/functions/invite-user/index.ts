// Edge Function: invite a user by email. The only place the service role key is used.
// The caller must hold create on settings.users; the new profile is placed in the caller's company.
import { createClient } from "jsr:@supabase/supabase-js@2";

type Body = { email: string; full_name: string; phone?: string; role_id: string; job_title?: string; department?: string; redirect_to?: string; company_id?: string };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Caller context (RLS applies): who is inviting and may they?
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) return json(401, { error: "Not signed in" });
    const { data: allowed } = await caller.rpc("has_permission", { p_resource: "settings.users", p_action: "create" });
    if (!allowed) return json(403, { error: "You do not have permission to invite users" });
    const { data: profile } = await caller.from("profiles").select("company_id").eq("id", user.id).single();

    const body = (await req.json()) as Body;
    if (!body.email || !body.full_name || !body.role_id) return json(400, { error: "email, full_name and role_id are required" });

    // Only the system owner may invite into another company (for example the first Admin of a new customer).
    let companyId = profile?.company_id ?? null;
    if (body.company_id && body.company_id !== companyId) {
      const { data: isOwner } = await caller.rpc("is_owner");
      if (!isOwner) return json(403, { error: "Only the system owner can invite users into another company" });
      companyId = body.company_id;
    }

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(body.email, {
      redirectTo: body.redirect_to,
      data: { full_name: body.full_name, phone: body.phone ?? null, company_id: companyId },
    });
    if (error) return json(400, { error: error.message });
    const newId = invited.user.id;

    // The auth trigger creates the profile; complete it and assign the role as the caller (guards apply).
    await admin.from("profiles").upsert({ id: newId, company_id: companyId, full_name: body.full_name, email: body.email, phone: body.phone ?? null, job_title: body.job_title ?? null, department: body.department ?? null });
    const { error: roleErr } = await caller.from("user_roles").insert({ user_id: newId, role_id: body.role_id, is_primary: true });
    if (roleErr) return json(400, { error: roleErr.message, id: newId });

    return json(200, { id: newId });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
