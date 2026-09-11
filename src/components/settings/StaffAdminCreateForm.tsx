"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createStaffAccountAction } from "@/foundation/staff/admin-actions";
import { STAFF_ADMIN_COPY } from "@/foundation/staff/admin-guards";
import { STAFF_USERNAME_COPY } from "@/foundation/staff/username";
import type { Role } from "@/types/staff";

type StaffAdminCreateFormProps = {
  roles: Role[];
};

export function StaffAdminCreateForm({ roles }: StaffAdminCreateFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setSaving(true);

    const form = event.currentTarget;
    const result = await createStaffAccountAction(new FormData(form));

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    form.reset();
    setOpen(false);
    setMessage(STAFF_ADMIN_COPY.createSuccess);
    setSaving(false);
    router.refresh();
  }

  return (
    <section className="border-fog rounded-xl border bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-ink text-sm font-semibold">Add Staff</h3>
          <p className="text-skyline mt-1 text-sm">
            Create a Whitebird staff account. They will sign in with username
            and password.
          </p>
        </div>
        <button
          className="bg-signal text-white rounded-lg px-4 py-2.5 text-sm font-medium transition hover:opacity-90"
          onClick={() => {
            setOpen((current) => !current);
            setError(null);
          }}
          type="button"
        >
          {open ? "Cancel" : "Add Staff"}
        </button>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-signal" role="status">
          {message}
        </p>
      ) : null}

      {open ? (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-skyline flex flex-col gap-1.5 text-xs">
            Display name
            <input
              className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
              disabled={saving}
              name="displayName"
              required
              type="text"
            />
          </label>

          <label className="text-skyline flex flex-col gap-1.5 text-xs">
            Username
            <input
              autoComplete="off"
              className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
              disabled={saving}
              name="username"
              required
              spellCheck={false}
              type="text"
            />
          </label>

          <label className="text-skyline flex flex-col gap-1.5 text-xs">
            Role
            <select
              className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
              disabled={saving}
              name="role"
              required
            >
              {roles.map((role) => (
                <option key={role.id} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-skyline flex flex-col gap-1.5 text-xs">
            Auth email
            <input
              autoComplete="off"
              className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
              disabled={saving}
              name="email"
              required
              type="email"
            />
          </label>

          <label className="text-skyline flex flex-col gap-1.5 text-xs">
            Initial password
            <input
              autoComplete="new-password"
              className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
              disabled={saving}
              name="password"
              required
              type="password"
            />
          </label>

          <label className="text-skyline flex flex-col gap-1.5 text-xs">
            Confirm password
            <input
              autoComplete="new-password"
              className="border-fog text-ink rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10"
              disabled={saving}
              name="confirmPassword"
              required
              type="password"
            />
          </label>

          <p className="text-skyline md:col-span-2 text-xs">
            {STAFF_USERNAME_COPY.helper} Email is used for Auth and
            notifications only; staff sign in with username.
          </p>

          {error ? (
            <p className="md:col-span-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="md:col-span-2">
            <button
              className="bg-ink text-mist hover:bg-skyline rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Creating…" : "Create staff account"}
            </button>
          </div>
        </form>
      ) : error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
