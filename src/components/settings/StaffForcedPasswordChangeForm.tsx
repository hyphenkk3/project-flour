"use client";

import { useState } from "react";
import { isNextRedirectError } from "@/foundation/auth/next-redirect";
import { completeForcedPasswordChangeAction } from "@/foundation/staff/complete-password-change-actions";
import { STAFF_FORCED_PASSWORD_COPY } from "@/foundation/staff/forced-password-change";
import { STAFF_PASSWORD_COPY } from "@/foundation/staff/password-update";

export function StaffForcedPasswordChangeForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const formData = new FormData();
    formData.set("newPassword", newPassword);
    formData.set("confirmPassword", confirmPassword);

    try {
      const result = await completeForcedPasswordChangeAction(formData);
      if (result.error) {
        setError(result.error);
        setSaving(false);
      }
    } catch (error) {
      if (isNextRedirectError(error)) {
        throw error;
      }
      setError(STAFF_PASSWORD_COPY.failed);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="text-skyline flex flex-col gap-1.5 text-xs">
        New password
        <input
          autoComplete="new-password"
          className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
          disabled={saving}
          name="newPassword"
          onChange={(event) => setNewPassword(event.target.value)}
          type="password"
          value={newPassword}
        />
      </label>

      <label className="text-skyline flex flex-col gap-1.5 text-xs">
        Confirm new password
        <input
          autoComplete="new-password"
          className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
          disabled={saving}
          name="confirmPassword"
          onChange={(event) => setConfirmPassword(event.target.value)}
          type="password"
          value={confirmPassword}
        />
      </label>

      <div className="text-skyline space-y-1.5 text-xs">
        <p>{STAFF_FORCED_PASSWORD_COPY.helperTitle}</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>{STAFF_FORCED_PASSWORD_COPY.helperMinLength}</li>
        </ul>
      </div>

      <button
        className="bg-signal rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        disabled={saving}
        type="submit"
      >
        {saving
          ? STAFF_FORCED_PASSWORD_COPY.submitting
          : STAFF_FORCED_PASSWORD_COPY.submit}
      </button>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
