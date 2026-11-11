import type { StaffNotificationCode } from "@/foundation/staff/notification-preferences";
import type { StaffPushSubscriptionInput } from "@/foundation/staff/staff-notification-push-protocol";

export type ClaimedStaffPushDelivery = {
  deliveryId: string;
  eventId: string;
  staffId: string;
  subscriptionId: string;
  claimedUntil: string;
  code: StaffNotificationCode;
  subscription: StaffPushSubscriptionInput;
};

export type StaffPushSender = {
  send(input: {
    subscription: StaffPushSubscriptionInput;
    payload: string;
    urgency: "normal" | "high";
  }): Promise<void>;
};

export type StaffPushDeliveryCompleter = (input: {
  deliveryId: string;
  claimedUntil: string;
  status: "sent" | "failed" | "suppressed";
  errorCode?: string;
  revokeSubscription?: boolean;
}) => Promise<boolean>;

export type StaffPushPreSendResult = "send" | "retry" | "suppress";

function pushStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

export async function deliverClaimedStaffPushNotifications(input: {
  claimed: ClaimedStaffPushDelivery[];
  sender: StaffPushSender;
  complete: StaffPushDeliveryCompleter;
  beforeSend?: (
    delivery: ClaimedStaffPushDelivery,
  ) => Promise<StaffPushPreSendResult>;
}): Promise<{
  sent: number;
  failed: number;
  revoked: number;
  suppressed: number;
  completionFailures: number;
}> {
  const outcomes = await Promise.all(
    input.claimed.map(async (delivery) => {
      let status: "sent" | "failed" | "suppressed" = "failed";
      let errorCode: string | undefined;
      let revokeSubscription = false;
      let revoked = 0;
      let completionFailures = 0;

      try {
        const preSend = await input.beforeSend?.(delivery);
        if (preSend === "suppress") {
          status = "suppressed";
          errorCode = "stale_hold";
        } else if (preSend === "retry") {
          errorCode = "hold_preflight_failed";
        } else {
          await input.sender.send({
            subscription: delivery.subscription,
            payload: JSON.stringify({
              version: 1,
              eventId: delivery.eventId,
              code: delivery.code,
            }),
            urgency: delivery.code === "last_minute" ? "high" : "normal",
          });
          status = "sent";
        }
      } catch (error) {
        const statusCode = pushStatusCode(error);
        errorCode = statusCode ? `http_${statusCode}` : "transport_error";
        revokeSubscription = statusCode === 404 || statusCode === 410;
        if (revokeSubscription) revoked = 1;
      }

      try {
        const completed = await input.complete({
          deliveryId: delivery.deliveryId,
          claimedUntil: delivery.claimedUntil,
          status,
          errorCode,
          revokeSubscription,
        });
        if (!completed) completionFailures = 1;
      } catch {
        // The delivery lease will expire and permit a bounded retry. Do not
        // prevent remaining staff devices from receiving their own delivery.
        completionFailures = 1;
      }

      return { status, revoked, completionFailures };
    }),
  );

  return outcomes.reduce(
    (result, outcome) => {
      if (outcome.status === "sent") result.sent += 1;
      else if (outcome.status === "suppressed") result.suppressed += 1;
      else result.failed += 1;
      result.revoked += outcome.revoked;
      result.completionFailures += outcome.completionFailures;
      return result;
    },
    { sent: 0, failed: 0, revoked: 0, suppressed: 0, completionFailures: 0 },
  );
}
