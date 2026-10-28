"use client";

import { logoutAction } from "@/foundation/auth/actions";
import type { StaffProfile } from "@/types/staff";

type UserMenuProps = {
  staff: StaffProfile;
  compact?: boolean;
};

const compactHeaderActionClassName =
  "border-fog text-ink hover:border-signal inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border bg-white px-2 py-2 text-[11px] leading-[1.5] font-medium transition lg:min-h-0 lg:px-3 lg:text-xs";

function SettingsLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={
        compact
          ? compactHeaderActionClassName
          : "border-fog text-ink hover:border-signal block rounded-lg border bg-white px-3 py-2 text-xs font-medium transition"
      }
      href="/settings"
    >
      Settings
    </a>
  );
}

export function UserMenu({ staff, compact = false }: UserMenuProps) {
  if (compact) {
    return (
      <div className="flex min-w-0 items-center justify-end gap-1.5 md:gap-3">
        <div
          className="min-w-0 max-w-16 text-right sm:max-w-20 md:max-w-28"
          data-testid="staff-identity"
        >
          <p className="text-ink truncate text-[11px] font-medium sm:text-xs md:text-sm">
            {staff.displayName}
          </p>
          <p className="text-skyline truncate text-[10px] sm:text-[11px] md:text-xs">
            {staff.role.name}
          </p>
        </div>

        <div
          className="flex shrink-0 items-center gap-1 md:gap-2"
          data-testid="staff-header-actions"
        >
          <SettingsLink compact />
          <form action={logoutAction} className="shrink-0">
            <button
              className={compactHeaderActionClassName}
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
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
