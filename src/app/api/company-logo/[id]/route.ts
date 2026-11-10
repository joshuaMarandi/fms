import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Company logo, served from the company row (RLS: the user's own company, or any for the owner).
 * Cached in the browser; the ?v= version in the URL changes when the logo changes.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/company-logo/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("logo_data").eq("id", id).maybeSingle();
  const dataUrl = (data as { logo_data: string | null } | null)?.logo_data;
  if (!dataUrl) return new NextResponse("Not found", { status: 404 });

  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return new NextResponse("Invalid logo", { status: 500 });
  const body = Buffer.from(match[2]!, "base64");
  const versioned = request.nextUrl.searchParams.has("v");
  return new NextResponse(body, {
    headers: {
      "content-type": match[1]!,
      "cache-control": versioned ? "private, max-age=31536000, immutable" : "private, max-age=300",
    },
  });
}
