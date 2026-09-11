"use client";

import { useActionState, useState } from "react";
import {
  completePasskeyLoginAction,
  loginAction,
  type LoginState,
} from "@/foundation/auth/actions";
import {
  browserSupportsPasskeySignIn,
  classifyPasskeyFailure,
  isNextRedirectError,
  logPasskeyError,
  passkeyCeremonyFailureMessage,
  passkeySignInMessage,
} from "@/foundation/auth/passkeys";
import { createClient } from "@/lib/supabase/client";

const initialState: LoginState = { error: null };

type LoginFormProps = {
  /** Optional same-origin return path from `/login?next=…`. */
  next?: string | null;
};

export function LoginForm({ next = null }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  const [passkeyTone, setPasskeyTone] = useState<"quiet" | "error">("quiet");
  const [passkeyPending, setPasskeyPending] = useState(false);

  async function signInWithPasskey() {
    setPasskeyMessage(null);

    if (!browserSupportsPasskeySignIn()) {
      setPasskeyTone("quiet");
      setPasskeyMessage(passkeySignInMessage("unsupported"));
      return;
    }

    setPasskeyPending(true);
    let navigating = false;

    try {
      const supabase = createClient();
      let ceremonyError: unknown = null;

      try {
        const { error } = await supabase.auth.signInWithPasskey();
        if (error) ceremonyError = error;
      } catch (error) {
        ceremonyError = error;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (ceremonyError && !user) {
        logPasskeyError("signInWithPasskey", ceremonyError);
      }

      const ceremonyMessage = passkeyCeremonyFailureMessage({
        hasAuthenticatedUser: Boolean(user),
        ceremonyError,
      });

      if (ceremonyMessage) {
        const kind = classifyPasskeyFailure(ceremonyError);
        setPasskeyTone(kind === "failed" ? "error" : "quiet");
        setPasskeyMessage(ceremonyMessage);
        return;
      }

      if (!user) {
        setPasskeyTone("error");
        setPasskeyMessage(passkeySignInMessage("failed"));
        return;
      }

      const result = await completePasskeyLoginAction(next);
      if (!result.ok) {
        setPasskeyTone("error");
        setPasskeyMessage(result.error);
        return;
      }

      navigating = true;
      window.location.replace(result.destination);
    } catch (error) {
      if (isNextRedirectError(error)) {
        navigating = true;
        throw error;
      }
      logPasskeyError("signInWithPasskey", error);
      const kind = classifyPasskeyFailure(error);
      setPasskeyTone(kind === "failed" ? "error" : "quiet");
      setPasskeyMessage(passkeySignInMessage(kind));
    } finally {
      if (!navigating) {
        setPasskeyPending(false);
      }
    }
  }

  const busy = pending || passkeyPending;

  return (
    <div className="mt-10 flex w-full max-w-sm flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-5">
        {next ? <input name="next" type="hidden" value={next} /> : null}

        <label className="text-skyline flex flex-col gap-2 text-sm">
          Username
          <input
            autoComplete="username"
            className="border-fog text-ink focus:border-signal rounded-md border bg-white px-3 py-2.5 text-base outline-none"
            disabled={busy}
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
            disabled={busy}
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
          disabled={busy}
          type="submit"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <span className="border-fog h-px flex-1 border-t" />
        <span className="text-skyline text-xs tracking-[0.14em] uppercase">
          Or
        </span>
        <span className="border-fog h-px flex-1 border-t" />
      </div>

      <button
        className="border-fog text-ink hover:border-signal rounded-md border bg-white px-4 py-3 text-sm font-medium transition disabled:opacity-60"
        disabled={busy}
        onClick={() => void signInWithPasskey()}
        type="button"
      >
        {passkeyPending ? "Waiting for Passkey…" : "Sign in with Passkey"}
      </button>

      {passkeyMessage ? (
        <p
          className={
            passkeyTone === "error"
              ? "text-sm text-red-700"
              : "text-skyline text-sm"
          }
          role={passkeyTone === "error" ? "alert" : "status"}
        >
          {passkeyMessage}
        </p>
      ) : null}
    </div>
  );
}
