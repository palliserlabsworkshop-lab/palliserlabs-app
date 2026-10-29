"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitProject } from "@/app/actions";
import {
  FORMAT_OPTIONS,
  HOOKS_DEFAULT,
  HOOKS_MAX,
  HOOKS_MIN,
  MAX_REFERENCE_LINKS,
  MAX_DRIVE_LINKS,
  PLATFORM_OPTIONS,
  PURPOSE_OPTIONS,
  STYLE_MAX,
  STYLE_OPTIONS,
  TURNAROUND_HOURS,
  earliestDeadline,
  formatDeadline,
  isoDateFromToday,
  MAX_DEADLINE_DAYS,
  validateBrief,
  type BriefErrors,
  type BriefField,
  type Option,
} from "@/lib/brief";

const FIELD_ORDER: BriefField[] = [
  "projectName",
  "driveLink",
  "deadline",
  "format",
  "formatOther",
  "purpose",
  "style",
  "hookCount",
  "platform",
  "referenceLinks",
];

const inputClass =
  "h-12 w-full rounded-xl border bg-card px-3.5 text-base text-foreground placeholder:text-muted/60 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 sm:text-[0.9rem]";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-[0.75rem] font-bold text-orange-ink">
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
        {required && <span className="ml-0.5 text-orange">*</span>}
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
            className={`pressable inline-flex min-h-11 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3.5 py-2 text-[0.8rem] font-bold transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20 ${
              checked
                ? "border-foreground bg-foreground text-on-ink"
                : disabled
                  ? "cursor-not-allowed border-line bg-surface text-muted/50"
                  : invalid
                    ? "border-orange/60 bg-card text-foreground hover:border-foreground/30"
                    : "border-line bg-card text-foreground hover:border-foreground/30"
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
              <svg viewBox="0 0 16 16" className="h-3 w-3 animate-pop" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
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
  driveLinks: [""],
  format: [] as string[],
  formatOther: "",
  purpose: [] as string[],
  style: [] as string[],
  hookCount: HOOKS_DEFAULT,
  deadline: "",
  platform: [] as string[],
  referenceLinks: [""],
  notes: "",
};

export function ProjectForm({
  brands = [],
  defaultBrandId = null,
}: {
  /** The person's brands — when there's more than one, the form asks which it's for. */
  brands?: { id: string; name: string }[];
  /** Pre-selected brand (the pill being viewed), if any. */
  defaultBrandId?: string | null;
}) {
  const router = useRouter();
  const [brandId, setBrandId] = useState<string | null>(defaultBrandId);
  const [brandError, setBrandError] = useState("");
  // Follow the brand pill when the client switches brands.
  const [seenDefault, setSeenDefault] = useState(defaultBrandId);
  if (seenDefault !== defaultBrandId) {
    setSeenDefault(defaultBrandId);
    setBrandId(defaultBrandId);
  }
  const askBrand = brands.length > 1;
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<BriefErrors>({});
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [celebrating, setCelebrating] = useState(false);

  // After a successful submit, the button flashes green with a tick, then settles back.
  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setCelebrating(false), 2600);
    return () => clearTimeout(t);
  }, [celebrating]);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Clear a group's error as soon as the client fixes it.
    const field = (key === "driveLinks" ? "driveLink" : key) as BriefField;
    setErrors((e) => {
      if (!(field in e)) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  };

  const focusFirstError = (errs: BriefErrors) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const payload = () => ({
    ...values,
    brandId: brandId ?? "",
    driveLinks: values.driveLinks.map((l) => l.trim()).filter(Boolean),
    referenceLinks: values.referenceLinks.map((l) => l.trim()).filter(Boolean),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (askBrand && !brandId) {
      setBrandError("Choose which brand this is for.");
      formRef.current?.querySelector<HTMLElement>('[data-field="brand"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
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
        setCelebrating(true);
        setValues(EMPTY);
        setErrors({});
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <div className="card p-5 sm:p-6">
        {submitted && (
          <p role="status" className="mb-4 animate-rise rounded-xl bg-yellow/25 px-4 py-3 text-[0.85rem] leading-relaxed text-yellow-ink">
            <strong>“{submitted}”</strong> was sent to the team. You’ll see it in your tasks as <strong>Queued</strong>.
          </p>
        )}
        <p className="text-[0.9rem] leading-relaxed text-muted">
          Share your footage and tell us what you’d like made. It goes straight into our production queue.
        </p>
        <button
          type="button"
          disabled={celebrating}
          onClick={() => {
            setOpen(true);
            setSubmitted("");
          }}
          className={`mt-4 grid h-12 w-full place-items-center rounded-full px-7 text-[0.9rem] font-bold text-on-ink transition-[background-color,box-shadow,transform] duration-500 ease-[var(--ease-out-soft)] active:scale-[0.96] active:duration-100 sm:w-auto ${
            celebrating
              ? "bg-success shadow-[0_8px_24px_-8px_rgb(21_128_61/0.55)]"
              : "bg-foreground hover:bg-primary-ink"
          }`}
        >
          {/* Both labels share one grid cell so they cross-fade without the button changing size */}
          <span
            className={`col-start-1 row-start-1 flex items-center gap-2 transition-[opacity,transform] duration-400 ease-[var(--ease-out-soft)] ${
              celebrating ? "scale-90 opacity-0" : "scale-100 opacity-100 delay-150"
            }`}
          >
            <span aria-hidden className="text-lg leading-none">+</span>
            Start a new project
          </span>
          <span
            aria-hidden={!celebrating}
            className={`col-start-1 row-start-1 flex items-center gap-2 transition-[opacity,transform] duration-400 ease-[var(--ease-spring)] ${
              celebrating ? "scale-100 opacity-100 delay-100" : "scale-75 opacity-0"
            }`}
          >
            {celebrating && (
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] animate-pop" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="11" fill="currentColor" fillOpacity="0.22" />
                <path
                  d="M7 12.5l3.2 3.2L17 8.8"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="16"
                  className="animate-draw [--dash:16]"
                />
              </svg>
            )}
            Project sent
          </span>
        </button>
      </div>
    );
  }

  const minDate = earliestDeadline();
  const maxDate = isoDateFromToday(MAX_DEADLINE_DAYS);
  const quickDates = [
    { label: "24hrs", value: minDate },
    { label: "In 2 days", value: isoDateFromToday(2) },
    { label: "In 3 days", value: isoDateFromToday(3) },
    { label: "Next week", value: isoDateFromToday(7) },
  ].filter((q) => q.value >= minDate);

  const styleHint = values.style.length >= STYLE_MAX ? `${STYLE_MAX} of ${STYLE_MAX} picked` : `Pick up to ${STYLE_MAX}`;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="card animate-rise space-y-8 p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.8rem] text-muted">
          Fields marked <span className="font-bold text-orange">*</span> are required.
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="-mr-2 -mt-2 min-h-11 shrink-0 rounded-full px-4 text-[0.8rem] font-bold text-muted hover:bg-surface hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {askBrand && (
        <div data-field="brand">
          <GroupHeader label="Brand" required error={brandError} errorId="err-brand" />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brand">
            {brands.map((b) => {
              const checked = brandId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => {
                    setBrandId(b.id);
                    setBrandError("");
                  }}
                  className={`pressable min-h-11 rounded-full border px-4 text-[0.8rem] font-bold ${
                    checked
                      ? "border-foreground bg-foreground text-on-ink"
                      : brandError
                        ? "border-orange/60 bg-card text-foreground"
                        : "border-line bg-card text-foreground hover:border-foreground/30"
                  }`}
                >
                  {b.name || "Untitled brand"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Project name */}
      <div data-field="projectName">
        <label htmlFor="projectName" className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[0.85rem] font-bold text-foreground">
            Project name<span className="ml-0.5 text-orange">*</span>
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
          className={`${inputClass} ${errors.projectName ? "border-orange/70" : "border-line"}`}
        />
      </div>

      {/* Drive link */}
      <div data-field="driveLink">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
          <label htmlFor="driveLink-0" className="text-[0.85rem] font-bold text-foreground">
            Your footage<span className="ml-0.5 text-orange">*</span>
          </label>
          <FieldError id="err-driveLink" message={errors.driveLink} />
        </div>
        <div className="space-y-2">
          {values.driveLinks.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input
                id={`driveLink-${i}`}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={i === 0 ? undefined : `Footage link ${i + 1}`}
                value={link}
                onChange={(e) => {
                  const next = [...values.driveLinks];
                  next[i] = e.target.value;
                  set("driveLinks", next);
                }}
                placeholder="https://drive.google.com/…"
                aria-invalid={Boolean(errors.driveLink) || undefined}
                aria-describedby={`hint-driveLink${errors.driveLink ? " err-driveLink" : ""}`}
                className={`${inputClass} ${errors.driveLink ? "border-orange/70" : "border-line"}`}
              />
              {values.driveLinks.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove footage link ${i + 1}`}
                  onClick={() => set("driveLinks", values.driveLinks.filter((_, j) => j !== i))}
                  className="pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:text-foreground"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {values.driveLinks.length < MAX_DRIVE_LINKS && (
          <button
            type="button"
            onClick={() => set("driveLinks", [...values.driveLinks, ""])}
            className="mt-1.5 min-h-11 rounded-full px-1 text-[0.8rem] font-bold text-primary-ink hover:underline"
          >
            + Add another link
          </button>
        )}
        <p id="hint-driveLink" className="text-[0.75rem] leading-relaxed text-muted">
          Google Drive links to a video or a folder of clips — up to {MAX_DRIVE_LINKS}. Set each to ‘Anyone with the
          link can view’.
        </p>
      </div>

      {/* Deadline */}
      <div data-field="deadline">
        <GroupHeader label="Needed by" required error={errors.deadline} errorId="err-deadline" />
        <div className="flex flex-wrap gap-2">
          {quickDates.map((q) => {
            const checked = values.deadline === q.value;
            return (
              <button
                key={q.value}
                type="button"
                aria-pressed={checked}
                onClick={() => set("deadline", q.value)}
                className={`pressable min-h-11 rounded-full border px-4 text-[0.8rem] font-bold ${
                  checked ? "border-foreground bg-foreground text-on-ink" : "border-line bg-card text-foreground hover:border-foreground/30"
                }`}
              >
                {q.label}
              </button>
            );
          })}
        </div>
        <label htmlFor="deadline" className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border border-line bg-card px-3.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <rect x="2" y="3" width="12" height="11" rx="2.5" />
            <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Pick a date</span>
          <input
            id="deadline"
            type="date"
            min={minDate}
            max={maxDate}
            value={values.deadline}
            onChange={(e) => set("deadline", e.target.value)}
            aria-invalid={Boolean(errors.deadline) || undefined}
            aria-describedby={`hint-deadline${errors.deadline ? " err-deadline" : ""}`}
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground focus:outline-none sm:text-[0.9rem]"
          />
        </label>
        <p id="hint-deadline" className="mt-2 text-[0.75rem] leading-relaxed text-muted">
          {values.deadline ? (
            <>
              Due <strong className="text-foreground">{formatDeadline(values.deadline)}</strong> · {TURNAROUND_HOURS}-hour
              maximum turnaround per video.
            </>
          ) : (
            <>Our maximum turnaround is {TURNAROUND_HOURS} hours per video.</>
          )}
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
              className={`${inputClass} ${errors.formatOther ? "border-orange/70" : "border-line"}`}
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

      {/* Hooks — a segmented choice beats typing a number */}
      <div data-field="hookCount">
        <GroupHeader label="Hook variants" hint={`Up to ${HOOKS_MAX}`} error={errors.hookCount} errorId="err-hookCount" />
        <div role="radiogroup" aria-label="Number of hook variants" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
          {Array.from({ length: HOOKS_MAX - HOOKS_MIN + 1 }, (_, i) => HOOKS_MIN + i).map((n) => {
            const checked = values.hookCount === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => set("hookCount", n)}
                className={`pressable flex min-h-12 flex-col items-center justify-center rounded-xl py-1.5 text-[0.85rem] font-bold leading-tight ${
                  checked ? "bg-card text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground"
                }`}
              >
                {n === 1 ? "1 hook" : `${n} hooks`}
                <span className={`text-[0.66rem] font-bold ${n === 1 ? "text-muted" : "text-orange-ink"}`}>
                  {n === 1 ? "Included" : "Extra cost"}
                </span>
              </button>
            );
          })}
        </div>
        <p
          key={values.hookCount > 1 ? "paid" : "free"}
          className={`mt-2 animate-rise rounded-xl px-3.5 py-2.5 text-[0.75rem] leading-relaxed ${
            values.hookCount > 1 ? "bg-orange/10 text-orange-ink" : "text-muted"
          }`}
        >
          {values.hookCount > 1 ? (
            <>
              <strong>Additional charges apply.</strong> Each extra hook variant is billed on top of your project. We’ll
              confirm the cost with you before we start.
            </>
          ) : (
            "One opening hook is included. Add variants to test different openings (extra cost)."
          )}
        </p>
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
            className="mt-1.5 min-h-11 rounded-full px-1 text-[0.8rem] font-bold text-primary-ink hover:underline"
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
          className="w-full resize-y rounded-xl border border-line bg-card px-3.5 py-3 text-base leading-relaxed placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 sm:text-[0.9rem]"
        />
      </div>

      {formError && (
        <p role="alert" className="rounded-xl bg-orange/10 px-4 py-3 text-sm text-orange-ink">
          {formError}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="text-center text-[0.8rem] font-bold text-orange-ink">
          Please fix the highlighted fields above.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="pressable flex h-13 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[0.95rem] font-bold text-on-ink hover:bg-primary-ink disabled:cursor-wait disabled:opacity-70"
      >
        {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-ink/30 border-t-on-ink" aria-hidden />}
        {pending ? "Sending…" : "Done"}
      </button>
    </form>
  );
}
