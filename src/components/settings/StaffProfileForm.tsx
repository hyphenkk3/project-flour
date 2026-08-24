"use client";

import { useState } from "react";

import { updateStaffEmailAction } from "@/foundation/staff/profile-actions";

type StaffProfileFormProps = {
  initialEmail: string;
};

export function StaffProfileForm({
  initialEmail,
}: StaffProfileFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedInitialEmail = initialEmail.trim().toLowerCase();
  const emailChanged = normalizedEmail !== normalizedInitialEmail;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage(null);
    setError(null);

    if (!emailChanged) {
      setMessage("Your email address is already up to date.");
      return;
    }

    setConfirming(true);
  }

  async function handleConfirm() {
    setConfirming(false);
    setSaving(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.set("email", normalizedEmail);

    const result = await updateStaffEmailAction(formData);

    if (result.error) {
      setError(result.error);
    } else {
      setMessage("Email address updated successfully.");
    }

    setSaving(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="staff-email"
            className="text-skyline text-xs"
          >
            Email
          </label>

          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="border-fog text-ink placeholder:text-skyline min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
              disabled={saving}
            />

            <button
              type="submit"
              disabled={saving}
              className="bg-signal text-white rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save email"}
            </button>
          </div>

          <p className="text-skyline mt-1.5 text-xs">
            This address will be used for your Whitebird email notifications.
          </p>
        </div>

        {message ? (
          <p className="text-sm text-signal" role="status">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirming(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-email-title"
          >
            <h2
              id="confirm-email-title"
              className="text-ink text-lg font-semibold"
            >
              Confirm email address
            </h2>

            <p className="text-skyline mt-2 text-sm leading-6">
              Please confirm that the following email address is correct:
            </p>

            <div className="border-fog bg-mist text-ink mt-4 rounded-lg border px-4 py-3 text-sm font-medium break-all">
              {normalizedEmail}
            </div>

            <p className="text-skyline mt-3 text-xs leading-5">
              This address will be used for your Whitebird email notifications.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="border-fog text-ink rounded-lg border bg-white px-4 py-2 text-sm font-medium transition hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                className="bg-signal text-white rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90"
              >
                Yes, confirmed
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
