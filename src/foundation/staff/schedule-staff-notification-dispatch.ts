import { after } from "next/server";

import { deliverPendingStaffNotificationEmails } from "@/foundation/staff/staff-notification-dispatch";
import { runUnlessLegacyStaffNotificationEmailIsPaused } from "@/foundation/staff/legacy-staff-notification-email-pause";

/**
 * Fire-and-forget email dispatch after a trusted server mutation.
 * Failures are logged and never thrown to the business action.
 */
export function scheduleStaffNotificationDispatch(eventId?: string): void {
  runUnlessLegacyStaffNotificationEmailIsPaused(() => {
    const run = () =>
      void deliverPendingStaffNotificationEmails({ eventId }).catch(
        (error: unknown) => {
          console.error(
            "[staff-notifications] Scheduled dispatch failed:",
            error,
          );
        },
      );

    try {
      after(run);
    } catch {
      run();
    }
  });
}
