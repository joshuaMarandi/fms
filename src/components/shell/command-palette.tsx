"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Car, FileText, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { usePermissions } from "@/components/permissions/provider";
import { packageAllows } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import { DynamicIcon } from "./icon";
import { hasKey, t } from "@/i18n";

type Hit = { id: string; label: string; sub?: string; href: string };

export function CommandPalette() {
  const router = useRouter();
  const { resources, can, session, permissions } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [vehicles, setVehicles] = React.useState<Hit[]>([]);
  const [drivers, setDrivers] = React.useState<Hit[]>([]);
  const [requests, setRequests] = React.useState<Hit[]>([]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const supabase = createClient();
    const handle = setTimeout(async () => {
      if (q.length < 2) {
        setVehicles([]);
        setDrivers([]);
        setRequests([]);
        return;
      }
      const like = `%${q}%`;
      if (session.platformMode) {
        const { data } = await supabase.from("companies").select("id, name, city").is("deleted_at", null).ilike("name", like).limit(8);
        setVehicles([]);
        setRequests([]);
        setDrivers(((data ?? []) as { id: string; name: string; city: string | null }[]).map((x) => ({ id: x.id, label: x.name, sub: x.city ?? undefined, href: `/platform/companies/${x.id}` })));
        return;
      }
      const [v, d, r] = await Promise.all([
        can("fleet.details", "view")
          ? supabase.from("vehicles").select("id, registration, make, model").is("deleted_at", null).or(`registration.ilike.${like},make.ilike.${like},model.ilike.${like}`).limit(5)
          : Promise.resolve({ data: [] }),
        can("drivers.personal", "view")
          ? supabase.from("drivers").select("id, full_name, phone").is("deleted_at", null).or(`full_name.ilike.${like},phone.ilike.${like}`).limit(5)
          : Promise.resolve({ data: [] }),
        can("daily_use.trip_requests", "view")
          ? supabase.from("vehicle_requests").select("id, requester_name, destination, status").is("deleted_at", null).or(`requester_name.ilike.${like},destination.ilike.${like}`).limit(5)
          : Promise.resolve({ data: [] }),
      ]);
      setVehicles(((v.data ?? []) as { id: string; registration: string; make: string; model: string }[]).map((x) => ({ id: x.id, label: x.registration, sub: `${x.make} ${x.model}`, href: `/fleet/${x.id}` })));
      setDrivers(((d.data ?? []) as { id: string; full_name: string; phone: string | null }[]).map((x) => ({ id: x.id, label: x.full_name, sub: x.phone ?? undefined, href: `/drivers/${x.id}` })));
      setRequests(((r.data ?? []) as { id: string; requester_name: string | null; destination: string | null; status: string }[]).map((x) => ({ id: x.id, label: `${x.requester_name ?? ""}: ${x.destination ?? ""}`, sub: t(`status.${x.status}`), href: `/daily-use/trip-requests/${x.id}` })));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, can, session.platformMode]);

  const pages = React.useMemo(
    () =>
      resources
        .filter((r) => r.path && can(r.key, "view"))
        .filter((r) =>
          session.platformMode
            ? r.key.startsWith("platform.") || r.key === "settings.roles" || r.key === "settings.audit"
            : !r.key.startsWith("platform") && (!session.isOwner || packageAllows(permissions.packageKeys, r.key)),
        )
        .map((r) => ({ key: r.key, label: hasKey(`resource.${r.key}`) ? t(`resource.${r.key}`) : r.name, path: r.path!, icon: r.icon })),
    [resources, can, session.platformMode, session.isOwner, permissions.packageKeys],
  );

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <Button variant="outline" className="h-10 w-10 justify-start gap-2 px-0 text-muted-foreground md:w-64 md:px-3" onClick={() => setOpen(true)} aria-label={t("nav.search_placeholder")}>
        <Search className="mx-auto size-4 md:mx-0" aria-hidden="true" />
        <span className="hidden flex-1 truncate text-left text-sm md:inline">{t("common.search")}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium md:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t("common.search")} description={t("nav.search_placeholder")}>
        <CommandInput placeholder={t("nav.search_placeholder")} value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{t("nav.no_results")}</CommandEmpty>
          {vehicles.length ? (
            <CommandGroup heading={t("nav.vehicles")}>
              {vehicles.map((h) => (
                <CommandItem key={h.id} value={`vehicle-${h.id}-${h.label}`} onSelect={() => go(h.href)}>
                  <Car /> <span>{h.label}</span> {h.sub ? <span className="ml-auto text-xs text-muted-foreground">{h.sub}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {drivers.length ? (
            <CommandGroup heading={session.platformMode ? t("platform.companies.title") : t("nav.drivers")}>
              {drivers.map((h) => (
                <CommandItem key={h.id} value={`driver-${h.id}-${h.label}`} onSelect={() => go(h.href)}>
                  <UserRound /> <span>{h.label}</span> {h.sub ? <span className="ml-auto text-xs text-muted-foreground">{h.sub}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {requests.length ? (
            <CommandGroup heading={t("nav.requests")}>
              {requests.map((h) => (
                <CommandItem key={h.id} value={`request-${h.id}-${h.label}`} onSelect={() => go(h.href)}>
                  <FileText /> <span className="truncate">{h.label}</span> {h.sub ? <span className="ml-auto text-xs text-muted-foreground">{h.sub}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {(vehicles.length || drivers.length || requests.length) ? <CommandSeparator /> : null}
          <CommandGroup heading={t("nav.pages")}>
            {pages.map((p) => (
              <CommandItem key={p.key} value={`page-${p.key}-${p.label}`} onSelect={() => go(p.path)}>
                <DynamicIcon icon={p.icon ?? "file"} /> <span>{p.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
