"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Monitor, RotateCcw, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { FormActions } from "@/components/patterns/form-actions";
import {
  TEMPLATE_BY_KEY,
  renderEmailTemplate,
  renderSmsTemplate,
  smsSegments,
  validateContent,
  type EmailFields,
  type EmailTemplateDef,
  type SmsTemplateDef,
  type TemplateContent,
} from "@/lib/messaging/registry";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { resetTemplate, saveTemplate, sendTestTemplate } from "../actions";

type FieldKey = keyof EmailFields | "text";

const EMAIL_FIELDS: { key: keyof EmailFields; label: string; rows?: number; hint?: string }[] = [
  { key: "subject", label: "settings.templates.field.subject" },
  { key: "heading", label: "settings.templates.field.heading" },
  { key: "greeting", label: "settings.templates.field.greeting" },
  { key: "paragraphs", label: "settings.templates.field.paragraphs", rows: 7, hint: "settings.templates.field.paragraphs_hint" },
  { key: "button", label: "settings.templates.field.button", hint: "settings.templates.field.button_hint" },
  { key: "note", label: "settings.templates.field.note", rows: 2 },
];

/**
 * Wording editor with a live preview. Values in curly brackets come from the record and cannot be
 * changed here; the details table and the link are always added by the system.
 */
export function TemplateEditor({
  templateKey,
  initial,
  fallback,
  hasOwn,
  canEdit,
  companyName,
  appName,
  appUrl,
}: {
  templateKey: string;
  initial: TemplateContent;
  fallback: TemplateContent;
  hasOwn: boolean;
  canEdit: boolean;
  companyName: string | null;
  appName: string;
  appUrl: string;
}) {
  const router = useRouter();
  const def = TEMPLATE_BY_KEY.get(templateKey)!;
  const [content, setContent] = React.useState<TemplateContent>(initial);
  const [busy, setBusy] = React.useState(false);
  const [view, setView] = React.useState<"desktop" | "phone">("desktop");
  const focused = React.useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  const errors = React.useMemo(() => validateContent(def, content), [def, content]);
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);
  const vars = React.useMemo(() => ({ ...def.sample, ...(companyName ? { company: companyName } : {}) }), [def, companyName]);

  const set = (key: FieldKey, value: string) => setContent((c) => ({ ...c, [key]: value }));

  function insert(p: string) {
    const target = focused.current;
    const token = `{${p}}`;
    if (!target) {
      const key: FieldKey = def.channel === "sms" ? "text" : "paragraphs";
      set(key, `${(content as Record<string, string>)[key] ?? ""}${token}`);
      return;
    }
    const { el, key } = target;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    set(key, next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]!);
      return;
    }
    setBusy(true);
    const res = await saveTemplate(templateKey, content);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("common.saved"));
      router.refresh();
    }
  }

  async function reset() {
    setBusy(true);
    const res = await resetTemplate(templateKey);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      setContent(fallback);
      toast.success(t("settings.templates.reset_done"));
      router.refresh();
    }
  }

  async function test() {
    if (dirty) {
      toast.error(t("settings.templates.save_first"));
      return;
    }
    setBusy(true);
    const res = await sendTestTemplate(templateKey);
    setBusy(false);
    if (res.ok) toast.success(res.message ?? t("settings.templates.test_sent"));
    else toast.error(res.error);
  }

  function remember(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    focused.current = { key: e.currentTarget.dataset.field as FieldKey, el: e.currentTarget };
  }

  return (
    <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <section className="page-card space-y-4 p-4 md:p-5">
          <div>
            <p className="text-sm font-medium">{t("settings.templates.values")}</p>
            <p className="text-xs text-muted-foreground">{t("settings.templates.values_hint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {def.placeholders.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={!canEdit}
                onClick={() => insert(p.key)}
                title={p.label}
                className="rounded-md border bg-muted/50 px-2 py-1 font-mono text-xs transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
              >
                {`{${p.key}}`}
                <span className="ml-1.5 font-sans text-muted-foreground">{p.label}</span>
              </button>
            ))}
          </div>
          {def.required.length ? (
            <p className="text-xs text-muted-foreground">
              {t("settings.templates.required_values")}: {def.required.map((r) => `{${r}}`).join(", ")}
            </p>
          ) : null}
        </section>

        <section className="page-card space-y-4 p-4 md:p-5">
          {def.channel === "sms" ? (
            <Field data-invalid={!!errors.text}>
              <FieldLabel htmlFor="tpl-text">{t("settings.templates.field.sms")}</FieldLabel>
              <Textarea id="tpl-text" rows={5} value={content.text ?? ""} disabled={!canEdit} onChange={(e) => set("text", e.target.value)} data-field="text" onFocus={remember} aria-invalid={!!errors.text} />
              <SmsCount text={renderSmsTemplate(def as SmsTemplateDef, content, vars)} />
              {errors.text ? <FieldError>{errors.text}</FieldError> : null}
            </Field>
          ) : (
            EMAIL_FIELDS.map((f) => {
              const value = (content as Record<string, string>)[f.key] ?? "";
              const err = errors[f.key];
              return (
                <Field key={f.key} data-invalid={!!err}>
                  <FieldLabel htmlFor={`tpl-${f.key}`}>{t(f.label)}</FieldLabel>
                  {f.rows ? (
                    <Textarea id={`tpl-${f.key}`} rows={f.rows} value={value} disabled={!canEdit} onChange={(e) => set(f.key, e.target.value)} data-field={f.key} onFocus={remember} aria-invalid={!!err} />
                  ) : (
                    <Input id={`tpl-${f.key}`} className="h-10" value={value} disabled={!canEdit} onChange={(e) => set(f.key, e.target.value)} data-field={f.key} onFocus={remember} aria-invalid={!!err} />
                  )}
                  {f.hint ? <FieldDescription>{t(f.hint)}</FieldDescription> : null}
                  {err ? <FieldError>{err}</FieldError> : null}
                </Field>
              );
            })
          )}
          {errors._ ? <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{errors._}</p> : null}
          {def.channel === "email" && (def as EmailTemplateDef).details ? <p className="text-xs text-muted-foreground">{t("settings.templates.details_fixed")}</p> : null}
        </section>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <FormActions onSave={save} busy={busy} />
            <Button type="button" variant="outline" className="h-10" onClick={test} disabled={busy}>
              <Send /> {def.channel === "email" ? t("settings.templates.test_email") : t("settings.templates.test_sms")}
            </Button>
            {hasOwn ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" className="h-10" disabled={busy}>
                    <RotateCcw /> {t("settings.templates.reset")}
                  </Button>
                }
                title={t("settings.templates.reset")}
                description={t("settings.templates.reset_confirm")}
                confirmLabel={t("settings.templates.reset")}
                onConfirm={reset}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("settings.templates.view_only")}</p>
        )}
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        {def.channel === "email" ? (
          <EmailPreview def={def as EmailTemplateDef} content={content} vars={vars} appName={appName} appUrl={appUrl} view={view} setView={setView} />
        ) : (
          <SmsPreview text={renderSmsTemplate(def as SmsTemplateDef, content, vars)} />
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("settings.templates.sample_note")}</p>
      </div>
    </div>
  );
}

function EmailPreview({
  def,
  content,
  vars,
  appName,
  appUrl,
  view,
  setView,
}: {
  def: EmailTemplateDef;
  content: TemplateContent;
  vars: Record<string, unknown>;
  appName: string;
  appUrl: string;
  view: "desktop" | "phone";
  setView: (v: "desktop" | "phone") => void;
}) {
  const mail = React.useMemo(() => renderEmailTemplate(def, content, vars, { appName, appUrl }), [def, content, vars, appName, appUrl]);
  const preheader = mail.text.split("\n").filter(Boolean).slice(1, 3).join(" ");
  return (
    <section className="page-card overflow-hidden" aria-label={t("settings.templates.preview")}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-sm font-medium">{t("settings.templates.preview")}</p>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label={t("settings.templates.preview_size")}>
          <button type="button" onClick={() => setView("desktop")} aria-pressed={view === "desktop"} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs", view === "desktop" && "bg-primary text-primary-foreground")}>
            <Monitor className="size-3.5" aria-hidden="true" /> {t("settings.templates.desktop")}
          </button>
          <button type="button" onClick={() => setView("phone")} aria-pressed={view === "phone"} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs", view === "phone" && "bg-primary text-primary-foreground")}>
            <Smartphone className="size-3.5" aria-hidden="true" /> {t("settings.templates.phone")}
          </button>
        </div>
      </div>
      {/* Inbox row: what the reader sees before opening the email */}
      <div className="flex gap-3 border-b bg-muted/30 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{appName.slice(0, 1)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm">
            <span className="font-semibold">{appName}</span>
          </p>
          <p className="truncate text-sm font-medium">{mail.subject}</p>
          <p className="truncate text-xs text-muted-foreground">{preheader}</p>
        </div>
      </div>
      <div className="bg-[#f4f3ee] p-2">
        <iframe title={t("settings.templates.preview")} srcDoc={mail.html} sandbox="" className={cn("mx-auto block h-[640px] rounded-md bg-white transition-all", view === "phone" ? "w-[375px] max-w-full" : "w-full")} />
      </div>
    </section>
  );
}

function SmsPreview({ text }: { text: string }) {
  return (
    <section className="page-card p-4" aria-label={t("settings.templates.preview")}>
      <p className="mb-3 text-sm font-medium">{t("settings.templates.preview")}</p>
      <div className="mx-auto w-full max-w-[320px] rounded-[2rem] border-4 border-foreground/80 bg-muted/40 p-3">
        <p className="mb-3 text-center text-xs text-muted-foreground">{process.env.NEXT_PUBLIC_SMS_SENDER_NAME || "FMS"}</p>
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-sm shadow-sm">{text}</div>
        <div className="h-48" aria-hidden="true" />
      </div>
      <div className="mt-3 flex justify-center">
        <SmsCount text={text} />
      </div>
    </section>
  );
}

function SmsCount({ text }: { text: string }) {
  const s = smsSegments(text);
  return (
    <p className={cn("text-xs", s.segments > 2 ? "text-warning" : "text-muted-foreground")}>
      {t("settings.templates.sms_count", { chars: s.length, parts: s.segments })}
      {!s.gsm ? ` · ${t("settings.templates.sms_unicode")}` : ""}
    </p>
  );
}
