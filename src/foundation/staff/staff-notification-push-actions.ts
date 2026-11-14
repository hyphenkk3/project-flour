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

export async function registerStaffPushSubscriptionAction(
  value: unknown,
): Promise<{ error: string | null }> {
  const staff = await requireStaff();
  const subscription = parseStaffPushSubscription(value);
  if (!subscription) {
    return { error: "This browser returned an unsupported push subscription." };
  }

  const saved = await saveStaffPushSubscription({
    staffId: staff.id,
    subscription,
  });
  return {
    error: saved ? null : "Push could not be enabled. Please try again.",
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
    return { error: "This browser push subscription is invalid." };
  }

  const revoked = await revokeStaffPushEndpoint({
    staffId: staff.id,
    endpoint,
  });
  return {
    error: revoked ? null : "Push could not be disabled. Please try again.",
  };
}
