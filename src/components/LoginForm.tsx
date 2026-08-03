"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/foundation/auth/actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="mt-10 flex w-full max-w-sm flex-col gap-5"
    >
      <label className="text-skyline flex flex-col gap-2 text-sm">
        Username
        <input
          autoComplete="username"
          className="border-fog text-ink focus:border-signal rounded-md border bg-white px-3 py-2.5 text-base outline-none"
          name="username"
          required
          spellCheck={false}
          type="text"
        />
      </label>

      <label className="text-skyline flex flex-col gap-2 text-sm">
        Password
        <input
          autoComplete="current-password"
          className="border-fog text-ink focus:border-signal rounded-md border bg-white px-3 py-2.5 text-base outline-none"
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
        className="bg-ink text-mist hover:bg-skyline mt-2 rounded-md px-4 py-3 text-sm font-medium transition disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
