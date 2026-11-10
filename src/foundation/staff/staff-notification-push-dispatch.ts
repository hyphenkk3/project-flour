import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  STAFF_NOTIFICATION_DEFINITIONS,
  type StaffNotificationCode,
} from "@/foundation/staff/notification-preferences";
import {
  deliverClaimedStaffPushNotifications,
  type ClaimedStaffPushDelivery,
  type StaffPushSender,
} from "@/foundation/staff/staff-notification-push-delivery-core";
import { parseStaffPushSubscription } from "@/foundation/staff/staff-notification-push-protocol";

// Keep each post-response/cron pass short and bound provider concurrency.
const PUSH_DELIVERY_LIMIT = 10;
const PUSH_LEASE_SECONDS = 120;

type PushClaimRow = {
  delivery_id: string;
  event_id: string;
  staff_id: string;
  subscription_id: string;
  claimed_until: string;
  code: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};

function environmentConfiguration() {
  const subject = process.env.STAFF_PUSH_VAPID_SUBJECT?.trim() ?? "";
  const publicKey =
    process.env.NEXT_PUBLIC_STAFF_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.STAFF_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  if (
    !subject ||
    !publicKey ||
    !privateKey ||
    !/^[A-Za-z0-9_-]{80,100}$/.test(publicKey) ||
    !/^[A-Za-z0-9_-]{40,60}$/.test(privateKey) ||
    !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/i.test(subject)
  ) {
    return null;
  }
  return { subject, publicKey, privateKey };
}

function isNotificationCode(value: string): value is StaffNotificationCode {
  return STAFF_NOTIFICATION_DEFINITIONS.some(
    (definition) => definition.code === value,
  );
}

function createWebPushSender(
  configuration: NonNullable<ReturnType<typeof environmentConfiguration>>,
): StaffPushSender {
  return {
    async send(input) {
      const webPush = await import("web-push");
      await webPush.sendNotification(input.subscription, input.payload, {
        vapidDetails: {
          subject: configuration.subject,
          publicKey: configuration.publicKey,
          privateKey: configuration.privateKey,
        },
        TTL: 60,
        urgency: input.urgency,
        timeout: 8_000,
      });
    },
  };
}

async function completeDelivery(input: {
  deliveryId: string;
  claimedUntil: string;
  status: "sent" | "failed";
  errorCode?: string;
  revokeSubscription?: boolean;
}): Promise<boolean> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc(
    "complete_staff_notification_push_delivery",
    {
      p_delivery_id: input.deliveryId,
      p_claimed_until: input.claimedUntil,
      p_status: input.status,
      p_error_code: input.errorCode ?? null,
      p_revoke_subscription: input.revokeSubscription ?? false,
    },
  );
  if (error) {
    console.error("[staff-push] Delivery completion failed:", {
      code: error.code ?? "unknown",
    });
    return false;
  }
  return data === true;
}

async function rejectInvalidSubscription(row: PushClaimRow) {
  await completeDelivery({
    deliveryId: row.delivery_id,
    claimedUntil: row.claimed_until,
    status: "failed",
    errorCode: "invalid_subscription",
    revokeSubscription: true,
  });
}

export async function deliverPendingStaffPushNotifications(input?: {
  eventId?: string;
}): Promise<{
  queued: number;
  attempted: number;
  sent: number;
  failed: number;
  revoked: number;
  skipped: "not_configured" | null;
}> {
  const configuration = environmentConfiguration();
  if (!configuration) {
    return {
      queued: 0,
      attempted: 0,
      sent: 0,
      failed: 0,
      revoked: 0,
      skipped: "not_configured",
    };
  }

  try {
    const admin = createServiceClient();
    const { data: queued, error: queueError } = await admin.rpc(
      "queue_staff_notification_push_deliveries",
      {
        p_event_id: input?.eventId ?? null,
        p_event_limit: PUSH_DELIVERY_LIMIT,
      },
    );
    if (queueError) {
      console.error("[staff-push] Queue preparation failed:", {
        code: queueError.code ?? "unknown",
      });
      return {
        queued: 0,
        attempted: 0,
        sent: 0,
        failed: 0,
        revoked: 0,
        skipped: null,
      };
    }

    const { data, error } = await admin.rpc(
      "claim_staff_notification_push_deliveries",
      {
        p_limit: PUSH_DELIVERY_LIMIT,
        p_event_id: input?.eventId ?? null,
        p_lease_seconds: PUSH_LEASE_SECONDS,
      },
    );
    if (error) {
      console.error("[staff-push] Claim failed:", {
        code: error.code ?? "unknown",
      });
      return {
        queued: Number(queued ?? 0),
        attempted: 0,
        sent: 0,
        failed: 0,
        revoked: 0,
        skipped: null,
      };
    }

    const rows = (data ?? []) as PushClaimRow[];
    const claimed: ClaimedStaffPushDelivery[] = [];
    let revoked = 0;
    for (const row of rows) {
      const code = isNotificationCode(row.code) ? row.code : null;
      const subscription = parseStaffPushSubscription({
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth_secret },
      });
      if (!code || !subscription) {
        await rejectInvalidSubscription(row);
        revoked += 1;
        continue;
      }
      claimed.push({
        deliveryId: row.delivery_id,
        eventId: row.event_id,
        staffId: row.staff_id,
        subscriptionId: row.subscription_id,
        claimedUntil: row.claimed_until,
        code,
        subscription,
      });
    }

    const result = await deliverClaimedStaffPushNotifications({
      claimed,
      sender: createWebPushSender(configuration),
      complete: completeDelivery,
    });
    return {
      queued: Number(queued ?? 0),
      attempted: claimed.length,
      sent: result.sent,
      failed: result.failed,
      revoked: result.revoked + revoked,
      skipped: null,
    };
  } catch (error) {
    console.error("[staff-push] Dispatch failed:", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return {
      queued: 0,
      attempted: 0,
      sent: 0,
      failed: 0,
      revoked: 0,
      skipped: null,
    };
  }
}
