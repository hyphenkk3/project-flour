"use server";

import { requireStaff } from "@/foundation/auth/session";
import {
  parseStaffPushSubscription,
  isTrustedStaffPushEndpoint,
} from "@/foundation/staff/staff-notification-push-protocol";
import {
  revokeStaffPushEndpoint,
  saveStaffPushSubscription,
} from "@/foundation/staff/staff-notification-push-storage";

type StaffPushActionResult = { error: string | null };

export async function registerStaffPushSubscriptionAction(
  value: unknown,
): Promise<StaffPushActionResult> {
  const staff = await requireStaff();
  const subscription = parseStaffPushSubscription(value);
  if (!subscription) {
    return {
      error:
        "The browser returned invalid Push details. Refresh the Home Screen app and try again.",
    };
  }

  const saved = await saveStaffPushSubscription({
    staffId: staff.id,
    subscription,
  });
  return {
    error: saved
      ? null
      : "The Preview could not save this device's Push registration. Confirm you are signed in, refresh, and try again.",
  };
}

export async function syncCurrentStaffPushSubscriptionAction(
  value: unknown,
): Promise<{ error: string | null }> {
  return registerStaffPushSubscriptionAction(value);
}

export async function revokeStaffPushSubscriptionAction(
  endpointValue: string,
): Promise<{ error: string | null }> {
  const staff = await requireStaff();
  const endpoint = endpointValue.trim();
  if (!isTrustedStaffPushEndpoint(endpoint)) {
    return {
      error:
        "This device's Push registration could not be safely identified. Refresh and try again.",
    };
  }

  const revoked = await revokeStaffPushEndpoint({
    staffId: staff.id,
    endpoint,
  });
  return {
    error: revoked
      ? null
      : "The Preview could not retire this device's old Push registration. Do not send a test until it is resolved.",
  };
}
