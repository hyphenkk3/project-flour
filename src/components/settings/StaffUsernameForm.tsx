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
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(initialUsername);
  const [savedUsername, setSavedUsername] = useState(initialUsername);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usernameChanged = !staffUsernamesMatch(username, savedUsername);

  function collapseEditor() {
    setUsername(savedUsername);
    setError(null);
    setEditing(false);
  }

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
      setEditing(false);
      setMessage(result.warning ?? STAFF_USERNAME_COPY.success);
      router.refresh();
    }

    setSaving(false);
  }

  return (
    <div className="space-y-2">
      {editing ? (
        <form autoComplete="off" className="space-y-2" onSubmit={handleSubmit}>
          <label htmlFor="staff-account-handle" className="text-skyline text-xs">
            Username
          </label>

          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              autoComplete="off"
              className="border-fog text-ink placeholder:text-skyline min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
              disabled={saving}
              id="staff-account-handle"
              name="staffAccountHandle"
              onChange={(event) => setUsername(event.target.value)}
              spellCheck={false}
              type="text"
              value={username}
            />

            <button
              type="submit"
              disabled={saving || !usernameChanged}
              className="bg-signal text-white rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save username"}
            </button>
            <button
              className="border-fog text-ink rounded-lg border bg-white px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-60"
              disabled={saving}
              onClick={collapseEditor}
              type="button"
            >
              Cancel
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
      ) : (
        <>
          <p className="text-skyline text-xs">Username</p>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-ink min-w-0 flex-1 text-sm font-medium">
              {savedUsername}
            </p>
            <button
              className="bg-signal text-white rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90"
              onClick={() => {
                setUsername(savedUsername);
                setError(null);
                setEditing(true);
              }}
              type="button"
            >
              Edit username
            </button>
          </div>
          <p className="text-skyline text-xs">{STAFF_USERNAME_COPY.helper}</p>
          {message ? (
            <p className="text-sm text-signal" role="status">
              {message}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
