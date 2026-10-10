/**
 * Local legacy-worker pause bridge.
 *
 * This is deliberately hard-coded PAUSED: there is no environment-variable
 * override, dispatch activation, or backlog-recovery path. A future removal
 * requires a separately reviewed V1 transition.
 */
export const LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED = true;

/** Run no callback while the legacy email pause bridge is active. */
export function runUnlessLegacyStaffNotificationEmailIsPaused<T>(
  run: () => T,
): T | undefined {
  if (LEGACY_STAFF_NOTIFICATION_EMAIL_PAUSED) return undefined;
  return run();
}
