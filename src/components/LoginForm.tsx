"use client";

import { useActionState } from "react";
import {
  loginAction,
  type LoginState,
} from "@/foundation/auth/actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-10 flex w-full max-w-sm flex-col gap-5">
      <label className="flex flex-col gap-2 text-sm text-skyline">
        Username
        <input
          autoComplete="username"
          className="rounded-md border border-fog bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-signal"
          name="username"
          required
          spellCheck={false}
          type="text"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-skyline">
        Password
        <input
          autoComplete="current-password"
          className="rounded-md border border-fog bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-signal"
          name="password"
          required
          type="password"
        />
      </label>

      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        className="mt-2 rounded-md bg-ink px-4 py-3 text-sm font-medium text-mist transition hover:bg-skyline disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
