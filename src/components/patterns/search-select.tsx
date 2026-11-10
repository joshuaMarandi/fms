"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type SearchOption = { value: string; label: string; keywords?: string[]; hint?: string };

/**
 * Searchable dropdown for long lists (vehicles, drivers, users...). Type part of a registration,
 * make, model or name and only matching rows remain. Keyboard friendly; works on phones.
 */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  invalid,
  allowClear = true,
  className,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn("h-10 w-full justify-between px-3 font-normal", !selected && "text-muted-foreground", invalid && "border-destructive", className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder ?? t("common.select_placeholder")}</span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {allowClear && selected && !disabled ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={t("common.clear_filters")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange("");
                  }
                }}
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            <ChevronsUpDown className="size-4 opacity-50" aria-hidden="true" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0" align="start">
        <Command
          filter={(itemValue, search, keywords) => {
            const hay = `${itemValue} ${(keywords ?? []).join(" ")}`.toLowerCase();
            return search
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean)
              .every((word) => hay.includes(word))
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder ?? t("common.search")} className="h-11" />
          <CommandList className="max-h-72">
            <CommandEmpty>{t("nav.no_results")}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  keywords={o.keywords}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="min-h-10"
                >
                  <Check className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">{o.hint}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Build search options from loaded rows, adding every useful field as a search keyword. */
export function toSearchOptions(rows: ({ value: string; label: string } & Record<string, unknown>)[]): SearchOption[] {
  const keys = ["registration", "make", "model", "full_name", "phone", "email", "employment_number", "order_number", "garage_name", "name"];
  return rows.map((r) => ({
    value: r.value,
    label: r.label,
    keywords: keys.map((k) => r[k]).filter((v): v is string => typeof v === "string" && v.length > 0),
    hint: typeof r.status === "string" && r.status !== "in_service" ? t(`status.${r.status}`) : undefined,
  }));
}
