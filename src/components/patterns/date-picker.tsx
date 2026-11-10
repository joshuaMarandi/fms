"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDate, toISODate } from "@/lib/utils";
import { t } from "@/i18n";

/** Date picker that works with ISO date strings (YYYY-MM-DD). */
export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  placeholder,
  fromYear,
  toYear,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  fromYear?: number;
  toYear?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} className={cn("h-10 w-full justify-start font-normal", !value && "text-muted-foreground", className)}>
          <CalendarIcon className="size-4" aria-hidden="true" />
          {value ? formatDate(selected) : placeholder ?? t("common.pick_date")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={new Date(fromYear ?? 1990, 0)}
          endMonth={new Date(toYear ?? new Date().getFullYear() + 10, 11)}
          onSelect={(d) => {
            onChange(d ? toISODate(d) : null);
            setOpen(false);
          }}
        />
        <div className="flex items-center justify-between border-t p-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(toISODate(new Date())); setOpen(false); }}>
            {t("common.today")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); setOpen(false); }}>
            {t("common.none")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
