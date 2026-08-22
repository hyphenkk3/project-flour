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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage(null);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await updateStaffEmailAction(formData);

    if (result.error) {
      setError(result.error);
    } else {
      setMessage(
        email.trim().toLowerCase() === initialEmail.trim().toLowerCase()
          ? "Your email address is already up to date."
          : "Email update submitted. Please check your inbox if confirmation is required.",
      );
    }

    setSaving(false);
  }

  return (
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
          Use an email address you can access. You may be asked to confirm
          the new address by email.
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
  );
}
