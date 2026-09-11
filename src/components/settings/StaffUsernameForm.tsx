"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateStaffUsernameAction } from "@/foundation/staff/profile-actions";
import {
  STAFF_USERNAME_COPY,
  normalizeStaffUsername,
  staffUsernamesMatch,
  validateStaffUsername,
} from "@/foundation/staff/username";

type StaffUsernameFormProps = {
  initialUsername: string;
};

export function StaffUsernameForm({
  initialUsername,
}: StaffUsernameFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [savedUsername, setSavedUsername] = useState(initialUsername);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usernameChanged = !staffUsernamesMatch(username, savedUsername);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!usernameChanged) {
      setMessage(STAFF_USERNAME_COPY.unchanged);
      return;
    }

    const validationError = validateStaffUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    const formData = new FormData();
    formData.set("username", normalizeStaffUsername(username));

    const result = await updateStaffUsernameAction(formData);

    if (result.error) {
      setError(result.error);
    } else {
      const nextUsername = normalizeStaffUsername(username);
      setUsername(nextUsername);
      setSavedUsername(nextUsername);
      setMessage(STAFF_USERNAME_COPY.success);
      router.refresh();
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="staff-username" className="text-skyline text-xs">
        Username
      </label>

      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          id="staff-username"
          name="username"
          type="text"
          autoComplete="username"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="border-fog text-ink placeholder:text-skyline min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
          disabled={saving}
        />

        <button
          type="submit"
          disabled={saving || !usernameChanged}
          className="bg-signal text-white rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save username"}
        </button>
      </div>

      <p className="text-skyline text-xs">{STAFF_USERNAME_COPY.helper}</p>

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
