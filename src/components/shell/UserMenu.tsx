"use client";

import { logoutAction } from "@/foundation/auth/actions";
import type { StaffProfile } from "@/types/staff";

type UserMenuProps = {
  staff: StaffProfile;
  compact?: boolean;
};

function SettingsLink() {
  return (
    <a
      className="border-fog text-ink hover:border-signal block rounded-lg border bg-white px-3 py-2 text-xs font-medium transition"
      href="/settings"
    >
      Settings
    </a>
  );
}

export function UserMenu({ staff, compact = false }: UserMenuProps) {
  if (compact) {
    return (
      <div className="flex items-center justify-end gap-2 md:gap-3">
        <div className="min-w-0 text-right">
          <p className="text-ink truncate text-sm font-medium">
            {staff.displayName}
          </p>
          <p className="text-skyline truncate text-xs">{staff.role.name}</p>
        </div>

        <SettingsLink />

        <form action={logoutAction}>
          <button
            className="border-fog text-ink hover:border-signal rounded-lg border bg-white px-3 py-2 text-xs font-medium transition"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="border-fog flex flex-col gap-3 rounded-xl border bg-white p-3">
      <div className="min-w-0">
        <p className="text-ink truncate text-sm font-medium">
          {staff.displayName}
        </p>
        <p className="text-skyline truncate text-xs">{staff.role.name}</p>
      </div>

      <SettingsLink />

      <form action={logoutAction}>
        <button
          className="border-fog bg-mist text-ink hover:border-signal w-full rounded-lg border px-3 py-2 text-sm font-medium transition"
          type="submit"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
