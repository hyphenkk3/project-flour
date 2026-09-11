"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PASSKEY_COPY,
  browserSupportsPasskeySignIn,
  classifyPasskeyFailure,
  formatPasskeyAddedAt,
  logPasskeyError,
  passkeySetupMessage,
} from "@/foundation/auth/passkeys";
import { createClient } from "@/lib/supabase/client";

type PasskeyRow = {
  id: string;
  friendlyName: string;
  addedLabel: string;
};

function mapPasskeys(
  rows: Array<{
    id: string;
    friendly_name?: string;
    created_at: string;
  }>,
): PasskeyRow[] {
  return rows.map((row) => ({
    id: row.id,
    friendlyName: row.friendly_name?.trim() || "Passkey",
    addedLabel: formatPasskeyAddedAt(row.created_at),
  }));
}

export function StaffPasskeySettings() {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: listError } = await supabase.auth.passkey.list();
      if (listError) {
        logPasskeyError("passkey.list", listError);
        setError(PASSKEY_COPY.failedList);
        return;
      }
      setPasskeys(mapPasskeys(data ?? []));
    } catch (listError) {
      logPasskeyError("passkey.list", listError);
      setError(PASSKEY_COPY.failedList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void supabase.auth.passkey
      .list()
      .then(({ data, error: listError }) => {
        if (cancelled) return;
        if (listError) {
          logPasskeyError("passkey.list", listError);
          setError(PASSKEY_COPY.failedList);
          return;
        }
        setPasskeys(mapPasskeys(data ?? []));
      })
      .catch((listError: unknown) => {
        if (cancelled) return;
        logPasskeyError("passkey.list", listError);
        setError(PASSKEY_COPY.failedList);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function registerPasskey() {
    setMessage(null);
    setError(null);

    if (!browserSupportsPasskeySignIn()) {
      setError(passkeySetupMessage("unsupported"));
      return;
    }

    setRegistering(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError(PASSKEY_COPY.failedSetup);
        return;
      }

      const { error: registerError } = await supabase.auth.registerPasskey();
      if (registerError) {
        logPasskeyError("registerPasskey", registerError);
        const kind = classifyPasskeyFailure(registerError);
        if (kind === "cancelled") {
          setMessage(passkeySetupMessage(kind));
        } else {
          setError(passkeySetupMessage(kind));
        }
        return;
      }

      await loadPasskeys();
      setMessage(PASSKEY_COPY.successSetup);
    } catch (registerError) {
      logPasskeyError("registerPasskey", registerError);
      const kind = classifyPasskeyFailure(registerError);
      if (kind === "cancelled") {
        setMessage(passkeySetupMessage(kind));
      } else {
        setError(passkeySetupMessage(kind));
      }
    } finally {
      setRegistering(false);
    }
  }

  async function removePasskey(id: string) {
    setMessage(null);
    setError(null);
    setRemovingId(id);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.auth.passkey.delete({
        passkeyId: id,
      });
      if (deleteError) {
        logPasskeyError("passkey.delete", deleteError);
        setError(PASSKEY_COPY.failedDelete);
        return;
      }
      setConfirmingId(null);
      await loadPasskeys();
      setMessage(PASSKEY_COPY.successDelete);
    } catch (deleteError) {
      logPasskeyError("passkey.delete", deleteError);
      setError(PASSKEY_COPY.failedDelete);
    } finally {
      setRemovingId(null);
    }
  }

  const setupLabel =
    passkeys.length === 0 ? "Set up a Passkey" : "Add another Passkey";

  return (
    <section className="border-fog rounded-xl border bg-white p-5">
      <h3 className="text-ink text-sm font-semibold">Security</h3>
      <p className="text-skyline mt-1 text-sm">Passkeys</p>
      <p className="text-skyline mt-1 text-sm">
        Use a passkey to sign in to Whitebird without entering your password.
      </p>

      {loading ? (
        <p className="text-skyline mt-4 text-sm">Loading passkeys…</p>
      ) : passkeys.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {passkeys.map((passkey) => (
            <li
              className="border-fog flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              key={passkey.id}
            >
              <div>
                <p className="text-ink text-sm font-medium">
                  {passkey.friendlyName}
                </p>
                <p className="text-skyline text-xs">{passkey.addedLabel}</p>
              </div>
              {confirmingId === passkey.id ? (
                <div className="flex gap-2">
                  <button
                    className="bg-ink text-mist hover:bg-skyline rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60"
                    disabled={removingId === passkey.id}
                    onClick={() => void removePasskey(passkey.id)}
                    type="button"
                  >
                    {removingId === passkey.id ? "Removing…" : "Confirm remove"}
                  </button>
                  <button
                    className="border-fog text-ink rounded-md border px-3 py-2 text-xs font-medium"
                    disabled={removingId === passkey.id}
                    onClick={() => setConfirmingId(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="border-fog text-ink hover:border-signal rounded-md border px-3 py-2 text-xs font-medium"
                  disabled={registering || removingId !== null}
                  onClick={() => setConfirmingId(passkey.id)}
                  type="button"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        className="border-fog text-ink hover:border-signal mt-4 rounded-md border bg-white px-4 py-2.5 text-sm font-medium transition disabled:opacity-60"
        disabled={registering || removingId !== null || loading}
        onClick={() => void registerPasskey()}
        type="button"
      >
        {registering ? "Waiting for Passkey…" : setupLabel}
      </button>

      {message ? (
        <p className="text-skyline mt-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
