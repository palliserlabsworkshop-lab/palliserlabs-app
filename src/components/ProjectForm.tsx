"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitProject } from "@/app/actions";
import {
  FORMAT_OPTIONS,
  HOOKS_DEFAULT,
  HOOKS_MAX,
  HOOKS_MIN,
  MAX_REFERENCE_LINKS,
  PLATFORM_OPTIONS,
  PURPOSE_OPTIONS,
  STYLE_MAX,
  STYLE_OPTIONS,
  validateBrief,
  type BriefErrors,
  type BriefField,
  type Option,
} from "@/lib/brief";

const FIELD_ORDER: BriefField[] = [
  "projectName",
  "driveLink",
  "format",
  "formatOther",
  "purpose",
  "style",
  "hookCount",
  "platform",
  "referenceLinks",
];

const inputClass =
  "h-12 w-full rounded-xl border bg-white px-3.5 text-base text-foreground placeholder:text-muted/60 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 sm:text-[0.9rem]";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-[0.75rem] font-bold text-[#c2541b]">
      {message}
    </p>
  );
}

function GroupHeader({
  label,
  required,
  hint,
  error,
  errorId,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  errorId: string;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="text-[0.85rem] font-bold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
        {hint && <span className="ml-2 text-[0.75rem] font-normal text-muted">{hint}</span>}
      </span>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function ChipGroup({
  name,
  options,
  value,
  onChange,
  max,
  invalid,
  describedBy,
}: {
  name: string;
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  invalid?: boolean;
  describedBy?: string;
}) {
  const full = max !== undefined && value.length >= max;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-describedby={describedBy}>
      {options.map((o) => {
        const checked = value.includes(o.key);
        const disabled = full && !checked;
        return (
          <label
            key={o.key}
            className={`inline-flex min-h-10 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3.5 py-2 text-[0.8rem] font-bold transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20 ${
              checked
                ? "border-primary bg-primary/10 text-primary"
                : disabled
                  ? "cursor-not-allowed border-line bg-surface text-muted/50"
                  : invalid
                    ? "border-[#f0c2a6] bg-white text-foreground hover:border-foreground/30"
                    : "border-line bg-white text-foreground hover:border-foreground/30"
            }`}
          >
            <input
              type="checkbox"
              name={name}
              value={o.key}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(checked ? value.filter((k) => k !== o.key) : [...value, o.key])}
              className="sr-only"
            />
            {checked && (
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

const EMPTY = {
  projectName: "",
  driveLink: "",
  format: [] as string[],
  formatOther: "",
  purpose: [] as string[],
  style: [] as string[],
  hookVariants: true,
  hookCount: HOOKS_DEFAULT,
  platform: [] as string[],
  referenceLinks: [""],
  notes: "",
};

export function ProjectForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<BriefErrors>({});
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Clear a group's error as soon as the client fixes it.
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key as BriefField];
      return next;
    });
  };

  const focusFirstError = (errs: BriefErrors) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const payload = () => ({ ...values, referenceLinks: values.referenceLinks.map((l) => l.trim()).filter(Boolean) });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const { errors: errs } = validateBrief(payload());
    if (Object.keys(errs).length) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    startTransition(async () => {
      const result = await submitProject(payload());
      if (result.errors) {
        setErrors(result.errors);
        focusFirstError(result.errors);
      } else if (result.formError) {
        setFormError(result.formError);
      } else if (result.ok) {
        setSubmitted(values.projectName);
        setValues(EMPTY);
        setErrors({});
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        {submitted && (
          <p role="status" className="mb-4 rounded-xl bg-primary/10 px-4 py-3 text-[0.85rem] text-primary">
            <strong>“{submitted}”</strong> was sent to the team. You’ll see it in your tasks as <strong>Queued</strong>.
          </p>
        )}
        <p className="text-[0.9rem] leading-relaxed text-muted">
          Share your footage and tell us what you’d like made. It goes straight into our production queue.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setSubmitted("");
          }}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-[0.9rem] font-bold text-white transition hover:bg-primary sm:w-auto sm:px-6"
        >
          <span aria-hidden className="text-lg leading-none">+</span>
          Start a new project
        </button>
      </div>
    );
  }

  const styleHint = values.style.length >= STYLE_MAX ? `${STYLE_MAX} of ${STYLE_MAX} picked` : `Pick up to ${STYLE_MAX}`;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="space-y-7 rounded-2xl border border-line bg-white p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.8rem] text-muted">
          Fields marked <span className="font-bold text-primary">*</span> are required.
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="-mr-2 -mt-1 shrink-0 rounded-full px-3 py-1.5 text-[0.8rem] font-bold text-muted hover:bg-surface hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {/* Project name */}
      <div data-field="projectName">
        <label htmlFor="projectName" className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[0.85rem] font-bold text-foreground">
            Project name<span className="ml-0.5 text-primary">*</span>
          </span>
          <FieldError id="err-projectName" message={errors.projectName} />
        </label>
        <input
          id="projectName"
          value={values.projectName}
          onChange={(e) => set("projectName", e.target.value)}
          maxLength={200}
          placeholder="e.g. Spring launch video"
          aria-invalid={Boolean(errors.projectName) || undefined}
          aria-describedby={errors.projectName ? "err-projectName" : undefined}
          className={`${inputClass} ${errors.projectName ? "border-[#e8a27c]" : "border-line"}`}
        />
      </div>

      {/* Drive link */}
      <div data-field="driveLink">
        <label htmlFor="driveLink" className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[0.85rem] font-bold text-foreground">
            Google Drive link<span className="ml-0.5 text-primary">*</span>
          </span>
          <FieldError id="err-driveLink" message={errors.driveLink} />
        </label>
        <input
          id="driveLink"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          value={values.driveLink}
          onChange={(e) => set("driveLink", e.target.value)}
          placeholder="https://drive.google.com/…"
          aria-invalid={Boolean(errors.driveLink) || undefined}
          aria-describedby={`hint-driveLink${errors.driveLink ? " err-driveLink" : ""}`}
          className={`${inputClass} ${errors.driveLink ? "border-[#e8a27c]" : "border-line"}`}
        />
        <p id="hint-driveLink" className="mt-2 text-[0.75rem] leading-relaxed text-muted">
          A video file or a folder of videos. Make sure the link is set to ‘Anyone with the link can view’.
        </p>
      </div>

      <div className="h-px bg-line" />

      {/* Format */}
      <div data-field="format">
        <GroupHeader label="Format" required hint="Pick at least 1" error={errors.format} errorId="err-format" />
        <ChipGroup
          name="format"
          options={FORMAT_OPTIONS}
          value={values.format}
          onChange={(v) => {
            set("format", v);
            if (!v.includes("other")) set("formatOther", "");
          }}
          invalid={Boolean(errors.format)}
          describedBy={errors.format ? "err-format" : undefined}
        />
        {values.format.includes("other") && (
          <div className="mt-3" data-field="formatOther">
            <label htmlFor="formatOther" className="sr-only">
              Other format
            </label>
            <input
              id="formatOther"
              autoFocus
              value={values.formatOther}
              onChange={(e) => set("formatOther", e.target.value)}
              maxLength={200}
              placeholder="Describe the format"
              aria-invalid={Boolean(errors.formatOther) || undefined}
              aria-describedby={errors.formatOther ? "err-formatOther" : undefined}
              className={`${inputClass} ${errors.formatOther ? "border-[#e8a27c]" : "border-line"}`}
            />
            <div className="mt-1.5">
              <FieldError id="err-formatOther" message={errors.formatOther} />
            </div>
          </div>
        )}
      </div>

      {/* Purpose */}
      <div data-field="purpose">
        <GroupHeader label="Purpose" required hint="Pick at least 1" error={errors.purpose} errorId="err-purpose" />
        <ChipGroup
          name="purpose"
          options={PURPOSE_OPTIONS}
          value={values.purpose}
          onChange={(v) => set("purpose", v)}
          invalid={Boolean(errors.purpose)}
          describedBy={errors.purpose ? "err-purpose" : undefined}
        />
      </div>

      {/* Style */}
      <div data-field="style">
        <GroupHeader label="Style / tone" hint={styleHint} error={errors.style} errorId="err-style" />
        <ChipGroup
          name="style"
          options={STYLE_OPTIONS}
          value={values.style}
          onChange={(v) => set("style", v)}
          max={STYLE_MAX}
          invalid={Boolean(errors.style)}
        />
      </div>

      {/* Hooks */}
      <div data-field="hookCount">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="hookVariants" className="text-[0.85rem] font-bold text-foreground">
            Multiple hook variants?
          </label>
          <button
            id="hookVariants"
            type="button"
            role="switch"
            aria-checked={values.hookVariants}
            onClick={() => set("hookVariants", !values.hookVariants)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${values.hookVariants ? "bg-primary" : "bg-line"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                values.hookVariants ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        {values.hookVariants && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
            <label htmlFor="hookCount" className="text-[0.8rem] text-foreground">
              How many hooks?
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Fewer hooks"
                onClick={() => set("hookCount", Math.max(HOOKS_MIN, (values.hookCount || HOOKS_DEFAULT) - 1))}
                disabled={values.hookCount <= HOOKS_MIN}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-lg font-bold disabled:opacity-30"
              >
                −
              </button>
              <input
                id="hookCount"
                type="number"
                inputMode="numeric"
                min={HOOKS_MIN}
                max={HOOKS_MAX}
                value={Number.isNaN(values.hookCount) ? "" : values.hookCount}
                onChange={(e) => set("hookCount", e.target.value === "" ? NaN : Number(e.target.value))}
                aria-invalid={Boolean(errors.hookCount) || undefined}
                aria-describedby={errors.hookCount ? "err-hookCount" : undefined}
                className="h-9 w-14 rounded-lg border border-line bg-white text-center text-base font-bold tabular-nums focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                aria-label="More hooks"
                onClick={() => set("hookCount", Math.min(HOOKS_MAX, (values.hookCount || HOOKS_MIN) + 1))}
                disabled={values.hookCount >= HOOKS_MAX}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-lg font-bold disabled:opacity-30"
              >
                +
              </button>
            </div>
            <div className="basis-full empty:hidden">
              <FieldError id="err-hookCount" message={errors.hookCount} />
            </div>
          </div>
        )}
      </div>

      {/* Platform */}
      <div data-field="platform">
        <GroupHeader label="Platform" required hint="Pick at least 1" error={errors.platform} errorId="err-platform" />
        <ChipGroup
          name="platform"
          options={PLATFORM_OPTIONS}
          value={values.platform}
          onChange={(v) => set("platform", v)}
          invalid={Boolean(errors.platform)}
          describedBy={errors.platform ? "err-platform" : undefined}
        />
      </div>

      <div className="h-px bg-line" />

      {/* Reference links */}
      <div data-field="referenceLinks">
        <GroupHeader label="Reference links" hint="Optional" error={errors.referenceLinks} errorId="err-referenceLinks" />
        <p className="-mt-1 mb-3 text-[0.75rem] text-muted">Paste examples of videos you like.</p>
        <div className="space-y-2">
          {values.referenceLinks.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={`Reference link ${i + 1}`}
                value={link}
                onChange={(e) => {
                  const next = [...values.referenceLinks];
                  next[i] = e.target.value;
                  set("referenceLinks", next);
                }}
                placeholder="https://"
                className={`${inputClass} border-line`}
              />
              {values.referenceLinks.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove link ${i + 1}`}
                  onClick={() => set("referenceLinks", values.referenceLinks.filter((_, j) => j !== i))}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:text-foreground"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {values.referenceLinks.length < MAX_REFERENCE_LINKS && (
          <button
            type="button"
            onClick={() => set("referenceLinks", [...values.referenceLinks, ""])}
            className="mt-2.5 rounded-full px-1 py-1 text-[0.8rem] font-bold text-primary hover:underline"
          >
            + Add another link
          </button>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="mb-2.5 block text-[0.85rem] font-bold text-foreground">
          Notes <span className="ml-1 text-[0.75rem] font-normal text-muted">Optional</span>
        </label>
        <textarea
          id="notes"
          rows={3}
          maxLength={1500}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Anything else we should know?"
          className="w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-base leading-relaxed placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 sm:text-[0.9rem]"
        />
      </div>

      {formError && (
        <p role="alert" className="rounded-xl bg-orange/10 px-4 py-3 text-sm text-[#b4501a]">
          {formError}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="text-center text-[0.8rem] font-bold text-[#c2541b]">
          Please fix the highlighted fields above.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[0.95rem] font-bold text-white transition hover:bg-primary active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
      >
        {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />}
        {pending ? "Sending…" : "Done"}
      </button>
    </form>
  );
}
