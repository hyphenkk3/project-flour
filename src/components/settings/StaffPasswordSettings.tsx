"use client";

import { useState } from "react";

import {
  STAFF_PASSWORD_COPY,
  validatePasswordChangeInput,
} from "@/foundation/staff/password-update";
import { updateStaffPasswordAction } from "@/foundation/staff/profile-actions";

export function StaffPasswordSettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearPasswordFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const validationError = validatePasswordChangeInput({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    const formData = new FormData();
    formData.set("currentPassword", currentPassword);
    formData.set("newPassword", newPassword);
    formData.set("confirmPassword", confirmPassword);

    const result = await updateStaffPasswordAction(formData);

    if (result.error) {
      setError(result.error);
    } else {
      clearPasswordFields();
      setMessage(STAFF_PASSWORD_COPY.success);
    }

    setSaving(false);
  }

  return (
    <section className="border-fog rounded-xl border bg-white p-5">
      <h3 className="text-ink text-sm font-semibold">Password</h3>
      <p className="text-skyline mt-1 text-sm">
        Change your Whitebird login password.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label className="text-skyline flex flex-col gap-1.5 text-xs">
          Current password
          <input
            autoComplete="current-password"
            className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
            disabled={saving}
            name="currentPassword"
            onChange={(event) => setCurrentPassword(event.target.value)}
            type="password"
            value={currentPassword}
          />
        </label>

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
          <p>{STAFF_PASSWORD_COPY.helperTitle}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>{STAFF_PASSWORD_COPY.helperMinLength}</li>
            <li>{STAFF_PASSWORD_COPY.helperDifferent}</li>
          </ul>
          <p>{STAFF_PASSWORD_COPY.helperCurrent}</p>
        </div>

        <button
          className="bg-signal text-white rounded-lg px-4 py-2.5 text-sm font-medium transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          disabled={saving}
          type="submit"
        >
          {saving ? "Changing password…" : "Change password"}
        </button>

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
    </section>
  );
}
