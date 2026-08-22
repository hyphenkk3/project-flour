export type GuestPreorderNotificationMode = "off" | "transient" | "persistent";

export const GUEST_PREORDER_NOTIFICATION_DEFAULT: GuestPreorderNotificationMode =
  "transient";

/** Same-tab change signal for useSyncExternalStore subscribers. */
export const GUEST_PREORDER_NOTIFICATION_CHANGE_EVENT =
  "wos:guest-preorder-notification-change";

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
  window.dispatchEvent(
    new CustomEvent(GUEST_PREORDER_NOTIFICATION_CHANGE_EVENT, {
      detail: { staffId },
    }),
  );
}

/**
 * Subscribe to preference changes for a staff member (cross-tab storage +
 * same-tab custom event). Used by shell controls via useSyncExternalStore.
 */
export function subscribeGuestPreorderNotificationPreference(
  staffId: string,
  onStoreChange: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const storageKey = guestPreorderNotificationStorageKey(staffId);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    onStoreChange();
  };
  const onLocal = (event: Event) => {
    const detail = (event as CustomEvent<{ staffId?: string }>).detail;
    if (detail?.staffId !== staffId) return;
    onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(GUEST_PREORDER_NOTIFICATION_CHANGE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(
      GUEST_PREORDER_NOTIFICATION_CHANGE_EVENT,
      onLocal,
    );
  };
}
