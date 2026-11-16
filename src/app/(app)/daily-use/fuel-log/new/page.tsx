import { redirect } from "next/navigation";

/** Fuel is issued against an approved fuel request, so "new" starts a fuel request. */
export default async function Page({ searchParams }: PageProps<"/daily-use/fuel-log/new">) {
  const sp = await searchParams;
  const vehicle = typeof sp.vehicle === "string" && /^[0-9a-f-]{36}$/i.test(sp.vehicle) ? sp.vehicle : null;
  redirect(`/daily-use/fuel-requests/new${vehicle ? `?vehicle=${vehicle}` : ""}`);
}
