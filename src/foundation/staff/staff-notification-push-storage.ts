import "server-only";

import type { StaffPushSubscriptionInput } from "@/foundation/staff/staff-notification-push-protocol";
import { createServiceClient } from "@/lib/supabase/admin";

export async function saveStaffPushSubscription(input: {
  staffId: string;
  subscription: StaffPushSubscriptionInput;
}): Promise<boolean> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc(
      "register_staff_notification_push_subscription",
      {
        p_staff_id: input.staffId,
        p_endpoint: input.subscription.endpoint,
        p_p256dh: input.subscription.keys.p256dh,
        p_auth_secret: input.subscription.keys.auth,
        p_expiration_time: input.subscription.expirationTime
          ? new Date(input.subscription.expirationTime).toISOString()
          : null,
      },
    );

    if (error) {
      console.error("[staff-push] Subscription save failed:", {
        code: error.code ?? "unknown",
      });
      return false;
    }
    return data === true;
  } catch (error) {
    console.error("[staff-push] Subscription save failed:", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}

export async function revokeStaffPushEndpoint(input: {
  staffId: string;
  endpoint: string;
}): Promise<boolean> {
  try {
    const admin = createServiceClient();
    const { error } = await admin
      .from("staff_notification_push_subscriptions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("staff_id", input.staffId)
      .eq("endpoint", input.endpoint)
      .is("revoked_at", null);

    if (error) {
      console.error("[staff-push] Subscription revoke failed:", {
        code: error.code ?? "unknown",
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[staff-push] Subscription revoke failed:", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}
