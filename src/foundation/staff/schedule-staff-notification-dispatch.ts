import { after } from "next/server";

import { deliverPendingStaffNotificationEmails } from "@/foundation/staff/staff-notification-dispatch";
import { deliverPendingStaffPushNotifications } from "@/foundation/staff/staff-notification-push-dispatch";
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

  // Push is independent of email pause state and runs only after the business
  // action has completed; provider errors cannot be thrown into that action.
  try {
    after(async () => {
      try {
        await deliverPendingStaffPushNotifications({ eventId });
      } catch (error) {
        console.error(
          "[staff-push] Scheduled dispatch failed:",
          error instanceof Error ? error.name : "unknown",
        );
      }
    });
  } catch {
    console.warn(
      "[staff-push] Post-response dispatch unavailable; push will wait for a later sweep.",
    );
  }
}
