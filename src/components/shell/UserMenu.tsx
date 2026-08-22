"use client";

import { useCallback, useSyncExternalStore } from "react";
import { logoutAction } from "@/foundation/auth/actions";
import {
  GUEST_PREORDER_NOTIFICATION_DEFAULT,
  readGuestPreorderNotificationPreference,
  subscribeGuestPreorderNotificationPreference,
  writeGuestPreorderNotificationPreference,
  type GuestPreorderNotificationMode,
} from "@/foundation/staff/guest-preorder-notification-preference";
import type { StaffProfile } from "@/types/staff";

type UserMenuProps = {
  staff: StaffProfile;
  compact?: boolean;
};

const MODES: { value: GuestPreorderNotificationMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "transient", label: "Transient" },
  { value: "persistent", label: "Persistent" },
];

function GuestPreorderNotificationPreference({
  staffId,
  compact,
}: {
  staffId: string;
  compact?: boolean;
}) {
  const mode = useSyncExternalStore(
    (onStoreChange) =>
      subscribeGuestPreorderNotificationPreference(staffId, onStoreChange),
    () => readGuestPreorderNotificationPreference(staffId),
    () => GUEST_PREORDER_NOTIFICATION_DEFAULT,
  );

  const selectMode = useCallback(
    (next: GuestPreorderNotificationMode) => {
      writeGuestPreorderNotificationPreference(staffId, next);
    },
    [staffId],
  );

  return (
    <fieldset
      className={
        compact
          ? "border-fog rounded-lg border px-2.5 py-2"
          : "border-fog rounded-lg border px-3 py-2.5"
      }
    >
      <legend
        className={
          compact
            ? "text-skyline px-1 text-[10px] font-medium tracking-wide uppercase"
            : "text-skyline px-1 text-[11px] font-medium tracking-wide uppercase"
        }
      >
        Guest preorder alerts
      </legend>

      <div
        className={
          compact
            ? "mt-1 flex flex-wrap gap-1"
            : "mt-1.5 flex flex-wrap gap-1.5"
        }
        role="radiogroup"
        aria-label="Guest preorder notification preference"
      >
        {MODES.map((entry) => {
          const selected = mode === entry.value;

          return (
            <button
              aria-checked={selected}
              className={[
                "rounded-md border px-2 py-1 text-xs font-medium transition",
                selected
                  ? "border-signal bg-signal/10 text-ink"
                  : "border-fog text-skyline hover:border-signal/40 hover:text-ink bg-white",
              ].join(" ")}
              key={entry.value}
              onClick={() => selectMode(entry.value)}
              role="radio"
              type="button"
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CompactSettings({ staffId }: { staffId: string }) {
  return (
    <details className="relative">
      <summary className="border-fog text-ink hover:border-signal flex cursor-pointer list-none items-center rounded-lg border bg-white px-3 py-2 text-xs font-medium transition">
        Settings
      </summary>

      <div className="border-fog bg-mist absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border p-3 shadow-lg">
        <GuestPreorderNotificationPreference
          compact
          staffId={staffId}
        />
      </div>
    </details>
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

        <CompactSettings staffId={staff.id} />

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

      <GuestPreorderNotificationPreference
        staffId={staff.id}
      />

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
