"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="email" className="block text-[0.8rem] font-bold text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
          placeholder="you@company.com"
          className="h-13 w-full rounded-2xl border border-line bg-white px-4 text-base text-foreground placeholder:text-muted/60 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-[0.8rem] font-bold text-foreground">
          App Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="\d{4}"
          maxLength={4}
          required
          placeholder="••••"
          onInput={(e) => {
            const el = e.currentTarget;
            el.value = el.value.replace(/\D/g, "").slice(0, 4);
          }}
          className="h-13 w-full rounded-2xl border border-line bg-white px-4 text-center text-2xl tracking-[0.75em] text-foreground placeholder:tracking-[0.5em] placeholder:text-muted/40 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
        />
        <p className="text-[0.75rem] text-muted">The 4-digit code we shared with you.</p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-orange/10 px-4 py-3 text-sm text-orange-ink">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[0.95rem] font-bold text-white transition hover:bg-primary active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
      >
        {pending && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
        )}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
