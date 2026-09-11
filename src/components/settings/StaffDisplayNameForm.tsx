"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateStaffDisplayNameAction } from "@/foundation/staff/profile-actions";

const STAFF_DISPLAY_NAME_COPY = {
  helper: "This name is shown to your team in Whitebird.",
  success: "Display name updated successfully.",
  unchanged: "No changes to save.",
  empty: "Please enter a display name.",
} as const;

type StaffDisplayNameFormProps = {
  initialDisplayName: string;
};

export function StaffDisplayNameForm({
  initialDisplayName,
}: StaffDisplayNameFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savedDisplayName, setSavedDisplayName] = useState(initialDisplayName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayNameChanged =
    displayName.trim() !== savedDisplayName.trim();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!displayNameChanged) {
      setMessage(STAFF_DISPLAY_NAME_COPY.unchanged);
      return;
    }

    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      setError(STAFF_DISPLAY_NAME_COPY.empty);
      return;
    }

    setSaving(true);

    const formData = new FormData();
    formData.set("displayName", nextDisplayName);

    const result = await updateStaffDisplayNameAction(formData);

    if (result.error) {
      setError(result.error);
    } else {
      setDisplayName(nextDisplayName);
      setSavedDisplayName(nextDisplayName);
      setMessage(STAFF_DISPLAY_NAME_COPY.success);
      router.refresh();
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="staff-display-name" className="text-skyline text-xs">
        Display name
      </label>

      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          id="staff-display-name"
          name="displayName"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="border-fog text-ink placeholder:text-skyline min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
          disabled={saving}
        />

        <button
          type="submit"
          disabled={saving || !displayNameChanged}
          className="bg-signal text-white rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save display name"}
        </button>
      </div>

      <p className="text-skyline text-xs">{STAFF_DISPLAY_NAME_COPY.helper}</p>

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
