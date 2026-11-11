"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller, type FieldValues, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field as UiField, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { DatePicker } from "./date-picker";
import { SignatureField, type SignatureValue } from "./signature-field";
import { AttachmentsBox } from "./attachments-box";
import { SearchSelect, toSearchOptions } from "./search-select";
import { FormActions } from "./form-actions";
import { usePermissions } from "@/components/permissions/provider";
import { saveRecord } from "@/lib/data/records";
import type { LoadedOptions } from "@/lib/data/records";
import {
  buildZod,
  conditionMet,
  defaultValues,
  toPayload,
  YEAR_OPTIONS,
  type Field,
  type FormComputeContext,
  type FormSchema,
} from "@/lib/forms/schema";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { cn, formatDate, formatNumber, formatTzs } from "@/lib/utils";
import { getSchema } from "@/modules/schemas";
import { hasKey, t } from "@/i18n";

export type SchemaFormProps = {
  /** Key into src/modules/schemas.ts (schemas hold functions and cannot cross the server boundary) */
  schemaKey: string;
  record?: Record<string, unknown> | null;
  options?: LoadedOptions;
  /** After save, navigate to `${afterSavePath}/${id}` (a plain string so server pages can pass it) */
  afterSavePath?: string;
  cancelHref?: string;
  readOnly?: boolean;
  /** Extra values merged into the payload (for example a parent id) */
  extra?: Record<string, unknown>;
  revalidate?: string[];
  title?: string;
  /** Called after a successful save in addition to navigation */
  onSaved?: (id: string) => void;
  children?: React.ReactNode;
  submitLabel?: string;
};

function tl(key: string | undefined) {
  if (!key) return "";
  return hasKey(key) ? t(key) : key;
}

function formatAuto(v: unknown, format?: string, digits?: number) {
  if (v === null || v === undefined || v === "") return "—";
  switch (format) {
    case "tzs":
      return formatTzs(v as number);
    case "number":
      return formatNumber(v as number, digits ?? 1);
    case "km":
      return `${formatNumber(v as number, digits ?? 1)} km`;
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

export function SchemaForm({ schemaKey, record, options = {}, afterSavePath, cancelHref, readOnly, extra, revalidate, onSaved, children, submitLabel }: SchemaFormProps) {
  const router = useRouter();
  const schema = getSchema(schemaKey);
  const { can, session } = usePermissions();
  const ctx = React.useMemo<FormComputeContext>(
    () => ({ options, session: { fullName: session.fullName, userId: session.userId, driverId: session.driverId }, record }),
    [options, session, record],
  );
  const canEdit = !readOnly && (record?.id ? can(schema.resource, "edit") : can(schema.resource, "create"));
  const defaults = React.useMemo(() => defaultValues(schema, record, ctx), [schema, record, ctx]);

  const form = useForm<FieldValues>({
    defaultValues: defaults,
    resolver: async (values, context, opts) => zodResolver(buildZod(schema, values))(values, context, opts),
    mode: "onBlur",
  });
  const [busy, setBusy] = React.useState(false);
  const formId = React.useId();

  async function onSubmit(values: FieldValues) {
    setBusy(true);
    const { payload, children: rows } = toPayload(schema, values);
    const res = await saveRecord({ table: schema.table, id: (record?.id as string) ?? null, values: { ...payload, ...(extra ?? {}) }, children: rows, revalidate });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t("common.saved"));
    onSaved?.(res.data.id);
    if (afterSavePath) {
      startNavigationProgress();
      router.push(`${afterSavePath}/${res.data.id}`);
      router.refresh();
    } else {
      router.refresh();
    }
  }

  const sections = schema.sections.filter((s) => !s.resource || can(s.resource, "view"));

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit, () => toast.error(t("form.fix_errors")))}
      className="space-y-6"
      noValidate
    >
      {sections.map((section, i) => {
        const body = (
          <div className="grid gap-4 md:grid-cols-2">
            {section.fields.map((f) => (
              <FieldRenderer key={f.name} field={f} form={form} ctx={ctx} disabled={!canEdit || (!!f.editResource && !can(f.editResource, "edit"))} recordId={(record?.id as string) ?? null} schema={schema} />
            ))}
          </div>
        );
        if (section.collapsible && section.title) {
          return (
            <Collapsible key={i} defaultOpen={section.defaultOpen ?? true} className="group/section page-card">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center gap-3 rounded-xl p-4 text-left hover:bg-muted/40 md:px-6">
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-90" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{tl(section.title)}</span>
                    {section.description ? <span className="block text-sm text-muted-foreground">{tl(section.description)}</span> : null}
                  </span>
                </button>
              </CollapsibleTrigger>
              {/* forceMount keeps typed values and added rows while a section is closed */}
              <CollapsibleContent forceMount className="px-4 pb-4 data-[state=closed]:hidden md:px-6 md:pb-6">
                {body}
              </CollapsibleContent>
            </Collapsible>
          );
        }
        return (
          <section key={i} className="page-card p-4 md:p-6">
            {section.title ? (
              <div className="mb-4">
                <h2 className="text-base font-semibold">{tl(section.title)}</h2>
                {section.description ? <p className="text-sm text-muted-foreground">{tl(section.description)}</p> : null}
              </div>
            ) : null}
            {body}
          </section>
        );
      })}
      {children}
      {canEdit ? <FormActions formId={formId} busy={busy} saveLabel={submitLabel} onCancel={cancelHref ? () => router.push(cancelHref) : undefined} /> : null}
    </form>
  );
}

function FieldRenderer({ field: f, form, ctx, disabled, recordId, schema, prefix }: { field: Field; form: UseFormReturn<FieldValues>; ctx: FormComputeContext; disabled: boolean; recordId: string | null; schema: FormSchema; prefix?: string }) {
  const name = prefix ? `${prefix}.${f.name}` : f.name;
  const values = form.watch();
  const scopeValues = prefix ? (getPath(values, prefix) as Record<string, unknown>) ?? {} : values;
  if (!conditionMet(f.showWhen, scopeValues)) return null;
  const error = getPath(form.formState.errors, name) as { message?: string } | undefined;
  const id = `f-${name.replace(/\./g, "-")}`;
  const label = tl(f.label);
  const span = f.colSpan === 2 || f.control === "textarea" || f.control === "rows" || f.control === "checkbox_group" || f.control === "signature" || f.control === "file" ? "md:col-span-2" : "";
  const isDisabled = disabled || !!f.readOnly;

  const wrap = (control: React.ReactNode, opts?: { noLabel?: boolean }) => (
    <UiField className={cn(span)} data-invalid={!!error}>
      {!opts?.noLabel ? (
        <FieldLabel htmlFor={id}>
          {label}
          {f.required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
        </FieldLabel>
      ) : null}
      {control}
      {f.description ? <FieldDescription>{tl(f.description)}</FieldDescription> : null}
      {error?.message ? <FieldError>{error.message}</FieldError> : null}
    </UiField>
  );

  switch (f.control) {
    case "hidden":
      return <input type="hidden" {...form.register(name)} />;
    case "text":
    case "email":
    case "tel":
      return wrap(<Input id={id} type={f.control === "text" ? "text" : f.control} inputMode={f.control === "tel" ? "tel" : undefined} disabled={isDisabled} aria-invalid={!!error} placeholder={f.placeholder} className="h-10" {...form.register(name)} />);
    case "textarea":
      return wrap(<Textarea id={id} rows={3} disabled={isDisabled} aria-invalid={!!error} placeholder={f.placeholder} {...form.register(name)} />);
    case "number":
      return wrap(
        <div className="relative">
          <Input id={id} type="number" inputMode="decimal" step={f.step ?? (f.integer ? 1 : "any")} min={f.min} max={f.max} disabled={isDisabled} aria-invalid={!!error} className={cn("h-10", f.unit && "pr-14")} {...form.register(name)} />
          {f.unit ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{f.unit}</span> : null}
        </div>,
      );
    case "time":
      return wrap(<Input id={id} type="time" disabled={isDisabled} aria-invalid={!!error} className="h-10" {...form.register(name)} />);
    case "datetime":
      return wrap(<Input id={id} type="datetime-local" disabled={isDisabled} aria-invalid={!!error} className="h-10" {...form.register(name)} />);
    case "date":
      return wrap(
        <Controller control={form.control} name={name} render={({ field }) => <DatePicker id={id} value={field.value as string} onChange={(v) => field.onChange(v ?? "")} disabled={isDisabled} />} />,
      );
    case "year":
      return wrap(
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(v)} disabled={isDisabled}>
              <SelectTrigger id={id} className="h-10 w-full" aria-invalid={!!error}>
                <SelectValue placeholder={t("common.select_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS(f.from ?? 1980).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />,
      );
    case "select": {
      const sourceOpts = f.source ? (ctx.options[f.source] ?? []).filter((o) => !f.sourceFilter || f.sourceFilter(o, scopeValues)) : [];
      const opts = f.options ? f.options.map((o) => ({ ...o, label: tl(o.label) })) : sourceOpts;
      return wrap(
        <Controller
          control={form.control}
          name={name}
          render={({ field }) =>
            f.source || opts.length > 8 ? (
              <SearchSelect
                id={id}
                value={(field.value as string) ?? ""}
                onChange={(v) => field.onChange(v)}
                options={f.source ? toSearchOptions(sourceOpts) : opts}
                disabled={isDisabled}
                invalid={!!error}
              />
            ) : (
              <Select value={(field.value as string) ?? ""} onValueChange={(v) => field.onChange(v ?? "")} disabled={isDisabled}>
                <SelectTrigger id={id} className="h-10 w-full" aria-invalid={!!error}>
                  <SelectValue placeholder={t("common.select_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {opts.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          }
        />,
      );
    }
    case "radio":
      return (
        <FieldSet className={cn(span)} data-invalid={!!error}>
          <FieldLegend variant="label">
            {label}
            {f.required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
          </FieldLegend>
          <Controller
            control={form.control}
            name={name}
            render={({ field }) => (
              <RadioGroup value={(field.value as string) ?? ""} onValueChange={field.onChange} disabled={isDisabled} className={cn(f.inline ? "flex flex-wrap gap-4" : "grid gap-2")}>
                {f.options.map((o) => (
                  <label key={o.value} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5">
                    <RadioGroupItem value={o.value} id={`${id}-${o.value}`} />
                    <span>{tl(o.label)}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
          {f.description ? <FieldDescription>{tl(f.description)}</FieldDescription> : null}
          {error?.message ? <FieldError>{error.message}</FieldError> : null}
        </FieldSet>
      );
    case "checkbox":
      return (
        <UiField className={cn(span)} data-invalid={!!error}>
          <Controller
            control={form.control}
            name={name}
            render={({ field }) => (
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                <Checkbox id={id} checked={!!field.value} onCheckedChange={(c) => field.onChange(!!c)} disabled={isDisabled} className="mt-0.5" />
                <span>
                  {label}
                  {f.required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
                  {f.description ? <span className="block text-xs text-muted-foreground">{tl(f.description)}</span> : null}
                </span>
              </label>
            )}
          />
          {error?.message ? <FieldError>{error.message}</FieldError> : null}
        </UiField>
      );
    case "switch":
      return (
        <UiField orientation="horizontal" className={cn(span, "rounded-lg border px-3 py-2")}>
          <FieldLabel htmlFor={id} className="flex-1">
            {label}
            {f.description ? <span className="block text-xs font-normal text-muted-foreground">{tl(f.description)}</span> : null}
          </FieldLabel>
          <Controller control={form.control} name={name} render={({ field }) => <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} disabled={isDisabled} />} />
        </UiField>
      );
    case "checkbox_group":
      return (
        <FieldSet className={cn(span)} data-invalid={!!error}>
          <FieldLegend variant="label">
            {label}
            {f.required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
          </FieldLegend>
          <Controller
            control={form.control}
            name={name}
            render={({ field }) => {
              const current = (field.value as string[]) ?? [];
              return (
                <div className={cn("grid gap-2", f.columns === 3 ? "sm:grid-cols-3" : f.columns === 1 ? "" : "sm:grid-cols-2")}>
                  {f.options.map((o) => (
                    <label key={o.value} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5">
                      <Checkbox
                        id={`${id}-${o.value}`}
                        checked={current.includes(o.value)}
                        disabled={isDisabled}
                        onCheckedChange={(c) => field.onChange(c ? [...current, o.value] : current.filter((x) => x !== o.value))}
                      />
                      <span>{tl(o.label)}</span>
                    </label>
                  ))}
                </div>
              );
            }}
          />
          {f.description ? <FieldDescription>{tl(f.description)}</FieldDescription> : null}
          {error?.message ? <FieldError>{error.message}</FieldError> : null}
        </FieldSet>
      );
    case "signature":
      return wrap(
        <Controller control={form.control} name={name} render={({ field }) => <SignatureField id={id} value={field.value as SignatureValue | null} onChange={field.onChange} disabled={isDisabled} />} />,
        { noLabel: false },
      );
    case "auto": {
      const v = f.compute ? f.compute(scopeValues, ctx) : scopeValues[f.name];
      return wrap(
        <div id={id} className="flex h-10 items-center rounded-lg border bg-muted/50 px-3 text-sm tabular-nums" aria-readonly="true">
          {formatAuto(v, f.format, f.digits)}
        </div>,
      );
    }
    case "file":
      return (
        <div className={cn(span)}>
          <p className="mb-2 text-sm font-medium">{label}</p>
          <AttachmentsBox table={schema.table} rowId={recordId} resource={schema.resource} bucket={f.bucket} labels={f.labels?.map(tl)} multiple={f.multiple} sensitive={f.sensitive} readOnly={isDisabled} />
        </div>
      );
    case "rows":
      return <RowsField field={f} form={form} ctx={ctx} disabled={isDisabled} name={name} schema={schema} recordId={recordId} />;
  }
}

function RowsField({ field: f, form, ctx, disabled, name, schema, recordId }: { field: Extract<Field, { control: "rows" }>; form: UseFormReturn<FieldValues>; ctx: FormComputeContext; disabled: boolean; name: string; schema: FormSchema; recordId: string | null }) {
  const { fields: rows, append, remove } = useFieldArray({ control: form.control, name });
  const values = form.watch();
  const rowValues = (getPath(values, name) as Record<string, unknown>[]) ?? [];
  const error = getPath(form.formState.errors, name) as { message?: string; root?: { message?: string } } | undefined;

  return (
    <FieldSet className="md:col-span-2">
      <div className="flex items-center justify-between">
        <FieldLegend variant="label">{tl(f.label)}</FieldLegend>
        {!disabled && (!f.maxRows || rows.length < f.maxRows) ? (
          <Button type="button" variant="outline" size="sm" onClick={() => append(f.defaultRow ? f.defaultRow(values, rowValues) : defaultRow(f))}>
            <Plus /> {f.addLabel ? tl(f.addLabel) : t("common.add_row")}
          </Button>
        ) : null}
      </div>
      {f.description ? <FieldDescription>{tl(f.description)}</FieldDescription> : null}
      <div className="space-y-3">
        {rows.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("common.empty_title")}</p> : null}
        {rows.map((row, idx) => (
          <div key={row.id} className="relative rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("common.row")} {idx + 1}
              </span>
              {!disabled && (!f.minRows || rows.length > f.minRows) ? (
                <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => remove(idx)} aria-label={t("common.remove_row")}>
                  <Trash2 /> {t("common.remove_row")}
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {f.fields.map((sub) => (
                <FieldRenderer key={sub.name} field={{ ...sub, colSpan: sub.colSpan }} form={form} ctx={ctx} disabled={disabled} recordId={recordId} schema={schema} prefix={`${name}.${idx}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {f.totals && f.totals.length > 0 ? (
        <dl className="mt-2 grid gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
          {f.totals.map((tt) => (
            <div key={tt.label}>
              <dt className="text-xs text-muted-foreground">{tl(tt.label)}</dt>
              <dd className="font-medium tabular-nums">{formatAuto(tt.compute(rowValues, values), tt.format)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {error?.message || error?.root?.message ? <FieldError>{error.message ?? error.root?.message}</FieldError> : null}
    </FieldSet>
  );
}

function defaultRow(f: Extract<Field, { control: "rows" }>) {
  const r: Record<string, unknown> = {};
  for (const sub of f.fields) {
    r[sub.name] = sub.control === "checkbox" || sub.control === "switch" ? false : sub.control === "checkbox_group" ? [] : sub.control === "auto" ? null : "";
  }
  return r;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}
