export type GuestPreorderNotificationMode = "off" | "transient" | "persistent";

export const GUEST_PREORDER_NOTIFICATION_DEFAULT: GuestPreorderNotificationMode =
  "transient";

export function guestPreorderNotificationStorageKey(staffId: string): string {
  return `wos:guest-preorder-notification:${staffId}`;
}

export function parseGuestPreorderNotificationPreference(
  raw: string | null | undefined,
): GuestPreorderNotificationMode {
  if (raw === "off" || raw === "transient" || raw === "persistent") {
    return raw;
  }
  return GUEST_PREORDER_NOTIFICATION_DEFAULT;
}

export function readGuestPreorderNotificationPreference(
  staffId: string,
): GuestPreorderNotificationMode {
  if (typeof window === "undefined") {
    return GUEST_PREORDER_NOTIFICATION_DEFAULT;
  }
  try {
    return parseGuestPreorderNotificationPreference(
      localStorage.getItem(guestPreorderNotificationStorageKey(staffId)),
    );
  } catch {
    return GUEST_PREORDER_NOTIFICATION_DEFAULT;
  }
}

export function writeGuestPreorderNotificationPreference(
  staffId: string,
  mode: GuestPreorderNotificationMode,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(guestPreorderNotificationStorageKey(staffId), mode);
  } catch {
    // private mode / unavailable
  }
}
