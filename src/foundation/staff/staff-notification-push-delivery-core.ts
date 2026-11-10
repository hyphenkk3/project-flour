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
  status: "sent" | "failed";
  errorCode?: string;
  revokeSubscription?: boolean;
}) => Promise<boolean>;

function pushStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

export async function deliverClaimedStaffPushNotifications(input: {
  claimed: ClaimedStaffPushDelivery[];
  sender: StaffPushSender;
  complete: StaffPushDeliveryCompleter;
}): Promise<{ sent: number; failed: number; revoked: number }> {
  const outcomes = await Promise.all(
    input.claimed.map(async (delivery) => {
      let status: "sent" | "failed" = "failed";
      let errorCode: string | undefined;
      let revokeSubscription = false;
      let revoked = 0;

      try {
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
      } catch (error) {
        const statusCode = pushStatusCode(error);
        errorCode = statusCode ? `http_${statusCode}` : "transport_error";
        revokeSubscription = statusCode === 404 || statusCode === 410;
        if (revokeSubscription) revoked = 1;
      }

      try {
        await input.complete({
          deliveryId: delivery.deliveryId,
          claimedUntil: delivery.claimedUntil,
          status,
          errorCode,
          revokeSubscription,
        });
      } catch {
        // The delivery lease will expire and permit a bounded retry. Do not
        // prevent remaining staff devices from receiving their own delivery.
      }

      return { status, revoked };
    }),
  );

  return outcomes.reduce(
    (result, outcome) => {
      if (outcome.status === "sent") result.sent += 1;
      else result.failed += 1;
      result.revoked += outcome.revoked;
      return result;
    },
    { sent: 0, failed: 0, revoked: 0 },
  );
}
