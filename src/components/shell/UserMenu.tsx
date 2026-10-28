"use client";

import { logoutAction } from "@/foundation/auth/actions";
import type { StaffProfile } from "@/types/staff";

type UserMenuProps = {
  staff: StaffProfile;
  compact?: boolean;
  compactHome?: boolean;
};

function SettingsLink({ compactHome = false }: { compactHome?: boolean }) {
  return (
    <a
      className={`border-fog text-ink hover:border-signal block rounded-lg border bg-white px-3 py-2 text-xs font-medium transition ${compactHome ? "min-h-11 md:min-h-0" : ""}`}
      href="/settings"
    >
      Settings
    </a>
  );
}

export function UserMenu({ staff, compact = false, compactHome = false }: UserMenuProps) {
  if (compact) {
    return (
      <div className={`flex min-w-0 flex-wrap items-center gap-2 md:gap-3 ${compactHome ? "justify-between md:justify-end" : "justify-end"}`}>
        <div className={`min-w-0 ${compactHome ? "text-left md:text-right" : "text-right"}`}>
          <p className="text-ink truncate text-sm font-medium">
            {staff.displayName}
          </p>
          <p className="text-skyline truncate text-xs">{staff.role.name}</p>
        </div>

        <SettingsLink compactHome={compactHome} />

        <form action={logoutAction}>
          <button
            className={`border-fog text-ink hover:border-signal rounded-lg border bg-white px-3 py-2 text-xs font-medium transition ${compactHome ? "min-h-11 md:min-h-0" : ""}`}
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

