"use client";

import * as React from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentsBox } from "./attachments-box";
import { useFileFallback } from "./file-fallback";
import type { SignatureValue } from "./signature-field";
import { conditionMet, type Field, type FormComputeContext, type FormSchema, type FormSection } from "@/lib/forms/schema";
import { cn, formatDate, formatNumber, formatTzs } from "@/lib/utils";
import { hasKey, t } from "@/i18n";

type Values = Record<string, unknown>;

const tl = (key?: string) => (key ? (hasKey(key) ? t(key) : key) : "");
const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** "Mobilization inspection: date of inspection" reads as "Date of inspection" under its section title. */
function shortLabel(key: string) {
  const full = tl(key);
  const i = full.indexOf(": ");
  const s = i > 0 ? full.slice(i + 2) : full;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Option label, preferring a short wording when one exists (key + ".short"). */
function optionLabel(label: string) {
  return hasKey(`${label}.short`) ? t(`${label}.short`) : tl(label);
}

function formatAuto(v: unknown, format?: string, digits?: number) {
  switch (format) {
    case "tzs":
      return formatTzs(v as number);
    case "number":
      return formatNumber(v as number, digits ?? 1);
    case "km":
      return `${formatNumber(v as number, digits ?? 0)} km`;
    case "litres":
      return `${formatNumber(v as number, digits ?? 1)} L`;
    case "hours":
      return `${formatNumber(v as number, digits ?? 2)} h`;
    case "date":
      return formatDate(v as string);
    default:
      return String(v);
  }
}

/** The value of one field as text (or a small element); null when there is nothing to show. */
function display(f: Field, v: unknown, values: Values, ctx: FormComputeContext): React.ReactNode | null {
  if (f.control === "auto") {
    const computed = f.compute ? f.compute(values, ctx) : v;
    return empty(computed) ? null : formatAuto(computed, f.format, f.digits);
  }
  if (empty(v)) return null;
  switch (f.control) {
    case "number": {
      const n = Number(v);
      const text = formatNumber(n, f.integer ? 0 : Number.isInteger(n) ? 0 : 2);
      return f.unit ? `${text} ${f.unit}` : text;
    }
    case "date":
      return formatDate(v as string);
    case "datetime":
      return formatDate(v as string, true);
    case "time":
      return String(v).slice(0, 5);
    case "year":
      return String(v);
    case "select": {
      const opts = f.options ?? (f.source ? (ctx.options[f.source] ?? []) : []);
      const o = opts.find((x) => String(x.value) === String(v));
      return o ? optionLabel(o.label) : String(v);
    }
    case "radio": {
      const o = f.options.find((x) => String(x.value) === String(v));
      return o ? optionLabel(o.label) : String(v);
    }
    case "checkbox":
    case "switch":
      return v ? (
        <span className="inline-flex items-center gap-1 text-success">
          <Check className="size-4" aria-hidden="true" /> {t("common.yes")}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <X className="size-4" aria-hidden="true" /> {t("common.no")}
        </span>
      );
    case "checkbox_group": {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      return (
        <span className="flex flex-wrap gap-1">
          {arr.map((x) => (
            <span key={x} className="status-chip status-chip-neutral">
              {optionLabel(f.options.find((o) => o.value === x)?.label ?? x)}
            </span>
          ))}
        </span>
      );
    }
    case "signature": {
      const s = v as SignatureValue;
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          {s.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- a drawn signature is a data URL
            <img src={s.image} alt="" className="h-10 rounded border bg-white" />
          ) : <Check className="size-4 text-success" aria-hidden="true" />}
          <span>{t("view.signed_by", { name: s.name, date: formatDate(s.signed_at, true) })}</span>
        </span>
      );
    }
    default:
      return String(v);
  }
}

const WIDE = new Set(["textarea", "rows", "file", "signature", "checkbox_group"]);

function FieldItem({ f, values, ctx, recordId, schema }: { f: Field; values: Values; ctx: FormComputeContext; recordId: string | null; schema: FormSchema }) {
  const fallback = useFileFallback(f.name);
  if (f.control === "hidden" || !conditionMet(f.showWhen, values)) return null;
  if (f.control === "file") {
    if (!recordId) return null;
    return (
      <div className="sm:col-span-2 lg:col-span-3">
        <dt className="mb-1 text-xs font-medium text-muted-foreground">{shortLabel(f.label)}</dt>
        <dd>
          <AttachmentsBox table={schema.table} rowId={recordId} resource={schema.resource} bucket={f.bucket} labels={f.labels?.map(tl)} multiple={f.multiple} sensitive={f.sensitive} readOnly fallback={fallback} />
        </dd>
      </div>
    );
  }
  if (f.control === "rows") return <RowsView f={f} values={values} ctx={ctx} />;
  const shown = display(f, values[f.name], values, ctx);
  if (shown === null) return null;
  return (
    <div className={cn("min-w-0", WIDE.has(f.control) && "sm:col-span-2 lg:col-span-3")}>
      <dt className="text-xs font-medium text-muted-foreground">{shortLabel(f.label)}</dt>
      <dd className={cn("mt-0.5 text-sm font-medium break-words", f.control === "textarea" && "font-normal whitespace-pre-line")}>{shown}</dd>
    </div>
  );
}

function RowsView({ f, values, ctx }: { f: Extract<Field, { control: "rows" }>; values: Values; ctx: FormComputeContext }) {
  const rows = (Array.isArray(values[f.name]) ? (values[f.name] as Values[]) : []).filter((r) => r && !r.deleted_at);
  if (rows.length === 0) return null;
  // Only the columns that have a value in at least one row.
  const cols = f.fields.filter((s) => s.control !== "hidden" && s.control !== "file" && rows.some((r) => display(s, r[s.name], r, ctx) !== null));
  return (
    <div className="min-w-0 sm:col-span-2 lg:col-span-3">
      <dt className="mb-1.5 text-xs font-medium text-muted-foreground">
        {tl(f.label)} <span className="tabular-nums">({rows.length})</span>
      </dt>
      <dd className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-8 px-3 py-2 font-medium">#</th>
              {cols.map((c) => (
                <th key={c.name} scope="col" className="px-3 py-2 font-medium">
                  {shortLabel(c.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={(r.id as string) ?? i} className="align-top">
                <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c.name} className={cn("px-3 py-2", c.control === "textarea" ? "min-w-[180px] whitespace-pre-line" : "whitespace-nowrap")}>
                    {display(c, r[c.name], r, ctx) ?? <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {f.totals && f.totals.length > 0 ? (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t bg-muted/30 px-3 py-2 text-sm">
            {f.totals.map((tt) => {
              const v = tt.compute(rows, values);
              return (
                <div key={tt.label} className="flex gap-2">
                  <dt className="text-muted-foreground">{tl(tt.label)}</dt>
                  <dd className="font-medium tabular-nums">{typeof v === "number" ? formatNumber(v, tt.format === "number" ? 0 : 1) : tt.format === "tzs" ? formatTzs(v as number) : String(v ?? "")}</dd>
                </div>
              );
            })}
          </dl>
        ) : null}
      </dd>
    </div>
  );
}

/** Groups for the view: the schema's viewGroups when it has them, otherwise its sections. */
function groupsOf(schema: FormSchema, sections: FormSection[]): { title?: string; fields: Field[] }[] {
  if (!schema.viewGroups) return sections.map((s) => ({ title: s.title, fields: s.fields }));
  const byName = new Map(sections.flatMap((s) => s.fields).map((f) => [f.name, f]));
  const used = new Set<string>();
  const groups: { title?: string; fields: Field[] }[] = schema.viewGroups.map((g) => ({
    title: g.title,
    fields: g.fields.map((n) => byName.get(n)).filter((f): f is Field => {
      if (f) used.add(f.name);
      return !!f;
    }),
  }));
  const rest = [...byName.values()].filter((f) => !used.has(f.name));
  if (rest.length) groups.push({ title: undefined, fields: rest });
  return groups;
}

/**
 * Read-only view of a saved record: short labels, only the fields that have a value, grouped into
 * cards. An Edit button (when allowed) switches the page to the form.
 */
export function RecordView({
  schema,
  sections,
  values,
  ctx,
  recordId,
  onEdit,
}: {
  schema: FormSchema;
  sections: FormSection[];
  values: Values;
  ctx: FormComputeContext;
  recordId: string | null;
  onEdit?: () => void;
}) {
  const groups = groupsOf(schema, sections);
  return (
    <div className="space-y-4">
      {groups.map((g, i) => {
        const items = g.fields.map((f) => <FieldItem key={f.name} f={f} values={values} ctx={ctx} recordId={recordId} schema={schema} />);
        const showEdit = !!onEdit && i === 0;
        return (
          <section key={i} className="page-card p-4 md:p-5">
            {g.title || showEdit ? (
              <div className="mb-3 flex items-center justify-between gap-3">
                {g.title ? <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{tl(g.title)}</h2> : <span />}
                {showEdit ? (
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={onEdit}>
                    <Pencil /> {t("common.edit")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{items}</dl>
            <EmptyHint fields={g.fields} values={values} ctx={ctx} />
          </section>
        );
      })}
    </div>
  );
}

function EmptyHint({ fields, values, ctx }: { fields: Field[]; values: Values; ctx: FormComputeContext }) {
  const any = fields.some((f) => {
    if (f.control === "hidden" || !conditionMet(f.showWhen, values)) return false;
    if (f.control === "file") return true;
    if (f.control === "rows") return Array.isArray(values[f.name]) && (values[f.name] as unknown[]).length > 0;
    return display(f, values[f.name], values, ctx) !== null;
  });
  return any ? null : <p className="text-sm text-muted-foreground">{t("view.nothing_recorded")}</p>;
}
