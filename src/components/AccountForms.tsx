"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeEmail, changePin, setupAccount, type AccountState } from "@/app/actions";
import { PIN_LENGTH, pinProblem } from "@/lib/pin-rules";

const inputBase =
  "h-13 w-full rounded-2xl border bg-surface px-4 text-base text-foreground placeholder:text-muted/60 transition focus:border-primary focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/10";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[0.8rem] font-semibold text-foreground">
      {children}
    </label>
  );
}

/** 6-digit PIN box: digits only, hidden, with the phone's number pad. */
function PinInput({
  id,
  label,
  invalid,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  invalid?: boolean;
  autoComplete: "new-password" | "current-password";
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        name={id}
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        pattern={`\\d{${PIN_LENGTH}}`}
        maxLength={PIN_LENGTH}
        required
        placeholder="••••••"
        aria-invalid={invalid || undefined}
        onInput={(e) => {
          const el = e.currentTarget;
          el.value = el.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
        }}
        className={`${inputBase} text-center text-2xl tracking-[0.6em] placeholder:tracking-[0.4em] placeholder:text-muted/40 ${
          invalid ? "border-orange/70" : "border-transparent"
        }`}
      />
      {hint && <p className="text-[0.75rem] text-muted">{hint}</p>}
    </div>
  );
}

function EmailInput({ id, label, defaultValue, invalid }: { id: string; label: string; defaultValue?: string; invalid?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        name={id}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={254}
        defaultValue={defaultValue}
        aria-invalid={invalid || undefined}
        className={`${inputBase} ${invalid ? "border-orange/70" : "border-transparent"}`}
      />
    </div>
  );
}

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="pressable flex h-13 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[0.95rem] font-semibold text-on-ink hover:bg-primary-ink disabled:cursor-wait disabled:opacity-70"
    >
      {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-ink/30 border-t-on-ink" aria-hidden />}
      {pending ? busy : idle}
    </button>
  );
}

function Message({ state, success }: { state: AccountState; success?: string }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-xl bg-orange/10 px-4 py-3 text-sm text-orange-ink">
        {state.error}
      </p>
    );
  }
  if (state.ok && success) {
    return (
      <p role="status" className="animate-rise rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success-ink">
        ✓ {success}
      </p>
    );
  }
  return null;
}

/** Quick browser-side check so obvious mistakes don't need a round trip (the server checks again). */
function precheckPins(form: HTMLFormElement): string | null {
  const pin = (form.elements.namedItem("pin") as HTMLInputElement | null)?.value ?? "";
  const confirm = (form.elements.namedItem("confirm") as HTMLInputElement | null)?.value ?? "";
  return pinProblem(pin) ?? (pin !== confirm ? "The two PINs don’t match." : null);
}

/** First sign-in with a temporary code. */
export function SetupForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(setupAccount, {});
  return (
    <form
      action={action}
      noValidate
      className="space-y-5"
      onSubmit={guardPins}
    >
      <EmailInput id="email" label="Your email" defaultValue={email} invalid={state.field === "email"} />
      <PinInput
        id="pin"
        label="Choose a 6-digit PIN"
        autoComplete="new-password"
        invalid={state.field === "pin"}
        hint="Avoid easy ones like 123456 or your birthday."
      />
      <PinInput id="confirm" label="Type it again" autoComplete="new-password" invalid={state.field === "confirm"} />
      <InlineError />
      <Message state={state} />
      <Submit pending={pending} idle="Save and continue" busy="Saving…" />
    </form>
  );
}

/** Account page: change PIN. */
export function ChangePinForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(changePin, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      className="space-y-5"
      onSubmit={guardPins}
    >
      <PinInput id="current" label="Current PIN" autoComplete="current-password" invalid={state.field === "current"} />
      <PinInput id="pin" label="New PIN" autoComplete="new-password" invalid={state.field === "pin"} />
      <PinInput id="confirm" label="Type the new PIN again" autoComplete="new-password" invalid={state.field === "confirm"} />
      <InlineError />
      <Message state={state} success="PIN updated. You’ve been signed out on any other devices." />
      <Submit pending={pending} idle="Update PIN" busy="Updating…" />
    </form>
  );
}

/** Account page: change email (the sign-in email). */
export function ChangeEmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(changeEmail, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} noValidate className="space-y-5">
      <p className="text-[0.85rem] text-muted">
        You sign in with <strong className="font-semibold text-foreground">{email}</strong>.
      </p>
      <EmailInput id="email" label="New email" invalid={state.field === "email"} />
      <EmailInput id="emailConfirm" label="Type it again" invalid={state.field === "emailConfirm"} />
      <PinInput id="current" label="Your PIN" autoComplete="current-password" invalid={state.field === "current"} />
      <Message state={state} success="Email updated. Use it next time you sign in." />
      <Submit pending={pending} idle="Update email" busy="Updating…" />
    </form>
  );
}

// A tiny inline error slot for the browser-side check, so it reads like the server's messages.
function InlineError() {
  return <p data-inline-error role="alert" className="hidden rounded-xl bg-orange/10 px-4 py-3 text-sm text-orange-ink" />;
}

/** Stops the submit and shows the problem inline if the new PINs aren't valid; otherwise clears it. */
function guardPins(e: React.FormEvent<HTMLFormElement>) {
  const problem = precheckPins(e.currentTarget);
  const el = e.currentTarget.querySelector<HTMLElement>("[data-inline-error]");
  if (problem) e.preventDefault();
  if (!el) return;
  el.textContent = problem ?? "";
  el.classList.toggle("hidden", !problem);
}
