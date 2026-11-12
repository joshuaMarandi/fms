import { z } from "zod";
import { t } from "@/i18n";

/**
 * Declarative form schema: every record form in the app is described with these types and
 * rendered by one component (SchemaForm). Controls follow section 3 of the build prompt.
 */
export type Option = { value: string; label: string };

/** Dynamic option sources loaded server-side and passed to the form as `options`. */
export type OptionSource = "vehicles" | "drivers" | "sites" | "profiles" | "leave_categories" | "roles" | "companies" | "work_orders" | "maintenance_requests" | "fuel_requests";

export type Condition = { field: string; equals?: string | boolean | number; in?: (string | number)[]; truthy?: boolean; includes?: string };

type Base = {
  name: string;
  /** i18n key */
  label: string;
  /** i18n key */
  description?: string;
  required?: boolean;
  readOnly?: boolean;
  showWhen?: Condition;
  /** 1 (half width) or 2 (full width) in a two-column grid */
  colSpan?: 1 | 2;
  placeholder?: string;
  /** Resource key a user must be able to edit for this field to be editable (defaults to the form's) */
  editResource?: string;
  /**
   * New records only: when one of `deps` (top-level fields) changes, set this field to compute().
   * Inside rows, compute gets the row index; return undefined to leave a value alone.
   */
  prefill?: { deps: string[]; compute: (values: Record<string, unknown>, ctx: FormComputeContext, rowIndex?: number) => unknown };
};

export type Field =
  | (Base & { control: "text"; /** Spaces are not allowed (for example registration numbers) */ noSpaces?: boolean })
  | (Base & { control: "email" | "tel" | "textarea" | "hidden" })
  | (Base & { control: "number"; min?: number; max?: number; step?: number; unit?: string; integer?: boolean })
  | (Base & { control: "date" | "time" | "datetime" })
  | (Base & { control: "year"; from?: number })
  | (Base & { control: "select"; options?: Option[]; source?: OptionSource; sourceFilter?: (opt: Option & Record<string, unknown>, values: Record<string, unknown>) => boolean })
  | (Base & { control: "radio"; options: Option[]; inline?: boolean })
  | (Base & { control: "checkbox" })
  | (Base & { control: "switch" })
  | (Base & { control: "checkbox_group"; options: Option[]; columns?: 1 | 2 | 3 })
  | (Base & { control: "signature" })
  | (Base & { control: "auto"; compute?: (values: Record<string, unknown>, ctx: FormComputeContext) => unknown; format?: "number" | "tzs" | "date" | "text" | "km" | "litres" | "hours"; digits?: number })
  | (Base & { control: "file"; bucket: string; multiple?: boolean; labels?: string[]; sensitive?: boolean })
  | (Base & {
      control: "rows";
      fields: Field[];
      childTable: string;
      fk: string;
      /** Fixed column values that identify this group of child rows (for example kind = injured) */
      childFilter?: Record<string, string | number | boolean>;
      minRows?: number;
      maxRows?: number;
      addLabel?: string;
      totals?: { label: string; compute: (rows: Record<string, unknown>[], values: Record<string, unknown>) => unknown; format?: "number" | "tzs" | "text" }[];
      defaultRow?: (values: Record<string, unknown>, rows: Record<string, unknown>[], ctx: FormComputeContext) => Record<string, unknown>;
    });

export type FormComputeContext = {
  options: Partial<Record<OptionSource, (Option & Record<string, unknown>)[]>>;
  session: { fullName: string; userId: string; driverId: string | null; phone?: string | null };
  record?: Record<string, unknown> | null;
};

export type FormSection = {
  /** i18n key */
  title?: string;
  description?: string;
  fields: Field[];
  /** Resource key needed to see this section (defaults to the form's resource) */
  resource?: string;
  /** Section can be opened and closed with its header. */
  collapsible?: boolean;
  /** Initial state of a collapsible section (default open). */
  defaultOpen?: boolean;
};

export type FormSchema = {
  table: string;
  resource: string;
  sections: FormSection[];
  /** Fields that are set server side and never sent */
  omitOnSave?: string[];
  /** Request table: show the approval panel */
  isRequest?: boolean;
  /** Label field used for the breadcrumb and title */
  titleField?: string | ((record: Record<string, unknown>) => string);
};

export function allFields(schema: FormSchema): Field[] {
  return schema.sections.flatMap((s) => s.fields);
}

export function conditionMet(cond: Condition | undefined, values: Record<string, unknown>): boolean {
  if (!cond) return true;
  const v = values[cond.field];
  if (cond.truthy !== undefined) return cond.truthy ? !!v : !v;
  if (cond.equals !== undefined) return v === cond.equals;
  if (cond.in) return cond.in.includes(v as string | number);
  if (cond.includes) return Array.isArray(v) && v.includes(cond.includes);
  return true;
}

function fieldZod(f: Field, values: Record<string, unknown>): z.ZodTypeAny {
  const visible = conditionMet(f.showWhen, values);
  const req = f.required && visible && !f.readOnly;
  const requiredMsg = t("form.required");
  switch (f.control) {
    case "text":
      if (f.noSpaces) {
        const s = z.string().trim().refine((v) => !/\s/.test(v), t("form.no_spaces"));
        return req ? s.refine((v) => v.length > 0, requiredMsg) : s.nullable().optional().or(z.literal(""));
      }
    // falls through
    case "textarea":
    case "tel":
    case "hidden":
    case "time":
    case "datetime":
    case "select":
    case "radio":
    case "date": {
      const s = z.string().trim();
      return req ? s.min(1, requiredMsg) : s.nullable().optional().or(z.literal(""));
    }
    case "email": {
      const s = z.string().trim();
      const base = s.refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), t("form.invalid_email"));
      return req ? s.min(1, requiredMsg).pipe(z.string().email(t("form.invalid_email"))) : base.nullable().optional();
    }
    case "year":
    case "number": {
      const base = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number({ message: t("form.invalid_number") }).nullable());
      let n: z.ZodTypeAny = base;
      if (f.control === "number") {
        n = base.refine((v) => v === null || f.min === undefined || v >= f.min, t("form.min_value", { min: f.min ?? 0 })).refine((v) => v === null || f.max === undefined || v <= f.max, t("form.max_value", { max: f.max ?? 0 }));
      }
      return req ? n.refine((v) => v !== null && !Number.isNaN(v), requiredMsg) : n.optional();
    }
    case "checkbox":
    case "switch":
      return req ? z.boolean().refine((v) => v === true, requiredMsg) : z.boolean().optional();
    case "checkbox_group": {
      const a = z.array(z.string());
      return req ? a.min(1, t("form.at_least_one")) : a.optional();
    }
    case "signature": {
      const sig = z.object({ method: z.string(), name: z.string(), user_id: z.string(), signed_at: z.string(), image: z.string().optional() });
      return req ? sig : sig.nullable().optional();
    }
    case "auto":
    case "file":
      return z.unknown().optional();
    case "rows": {
      // Each row is checked against its own values, so a field hidden in that row is not required.
      const row = z.record(z.string(), z.unknown()).superRefine((r, rctx) => {
        for (const sub of f.fields) {
          if (sub.control === "auto" || sub.control === "file") continue;
          const res = fieldZod(sub, r).safeParse(r[sub.name]);
          if (!res.success) for (const issue of res.error.issues) rctx.addIssue({ code: "custom", message: issue.message, path: [sub.name, ...issue.path] });
        }
      });
      const arr = z.array(row);
      return f.minRows && visible ? arr.min(f.minRows, t("form.at_least_one")) : arr.optional();
    }
  }
}

/** Builds a zod schema from the form. Conditional required-ness is evaluated against current values. */
export function buildZod(schema: FormSchema, values: Record<string, unknown>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of allFields(schema)) {
    if (f.control === "auto" || f.control === "file") continue;
    shape[f.name] = fieldZod(f, values);
  }
  return z.object(shape).passthrough();
}

export function defaultValues(schema: FormSchema, record?: Record<string, unknown> | null, ctx?: FormComputeContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of allFields(schema)) {
    const existing = record?.[f.name];
    switch (f.control) {
      case "checkbox":
      case "switch":
        out[f.name] = existing ?? false;
        break;
      case "checkbox_group":
        out[f.name] = Array.isArray(existing) ? existing : [];
        break;
      case "rows":
        out[f.name] = Array.isArray(existing) ? existing : [];
        break;
      case "number":
      case "year":
        out[f.name] = existing ?? "";
        break;
      case "signature":
        out[f.name] = existing ?? null;
        break;
      case "auto":
        out[f.name] = existing ?? (f.compute && ctx ? f.compute(record ?? {}, ctx) : null);
        break;
      case "file":
        break;
      case "date":
        out[f.name] = typeof existing === "string" ? existing.slice(0, 10) : existing ?? "";
        break;
      case "datetime":
        out[f.name] = typeof existing === "string" ? existing.slice(0, 16) : existing ?? "";
        break;
      case "time":
        out[f.name] = typeof existing === "string" ? existing.slice(0, 5) : existing ?? "";
        break;
      default:
        out[f.name] = existing ?? "";
    }
  }
  if (record?.id) out.id = record.id;
  return out;
}

/** Converts form values to a database payload: blanks become null, rows are split off. */
export function toPayload(schema: FormSchema, values: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  const children: { childTable: string; fk: string; rows: Record<string, unknown>[]; filter?: Record<string, string | number | boolean> }[] = [];
  const omit = new Set(schema.omitOnSave ?? []);
  for (const f of allFields(schema)) {
    if (omit.has(f.name)) continue;
    if (f.control === "file") continue;
    const v = values[f.name];
    if (f.control === "rows") {
      const rows = (Array.isArray(v) ? v : []).map((row) => {
        const r: Record<string, unknown> = {};
        for (const sub of f.fields) {
          if (sub.control === "auto" || sub.control === "file") continue;
          r[sub.name] = conditionMet(sub.showWhen, row as Record<string, unknown>) ? clean(sub, (row as Record<string, unknown>)[sub.name]) : clean(sub, "");
        }
        if ((row as Record<string, unknown>).id) r.id = (row as Record<string, unknown>).id;
        return r;
      });
      children.push({ childTable: f.childTable, fk: f.fk, rows: rows.map((r) => ({ ...r, ...(f.childFilter ?? {}) })), filter: f.childFilter });
      continue;
    }
    if (f.control === "auto") {
      // Auto fields are computed in the database; only send if the column exists and the form set it explicitly.
      continue;
    }
    if (!conditionMet(f.showWhen, values)) {
      payload[f.name] = f.control === "checkbox_group" ? [] : f.control === "checkbox" || f.control === "switch" ? false : null;
      continue;
    }
    payload[f.name] = clean(f, v);
  }
  return { payload, children };
}

function clean(f: Field, v: unknown) {
  if (v === "" || v === undefined) return f.control === "checkbox_group" ? [] : f.control === "checkbox" || f.control === "switch" ? false : null;
  if ((f.control === "number" || f.control === "year") && typeof v === "string") return v === "" ? null : Number(v);
  if (f.control === "datetime" && typeof v === "string" && v.length === 16) return new Date(v).toISOString();
  return v;
}

export const YEAR_OPTIONS = (from = 1990, to = new Date().getFullYear() + 1): Option[] =>
  Array.from({ length: to - from + 1 }, (_, i) => String(to - i)).map((y) => ({ value: y, label: y }));

export const MONTH_OPTIONS: Option[] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => ({ value: String(i + 1), label: m }));
