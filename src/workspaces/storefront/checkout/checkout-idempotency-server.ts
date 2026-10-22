import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  checkoutSubmissionPayload,
  isCheckoutRequestId,
} from "@/workspaces/storefront/checkout/checkout-attempt";
import { getCheckoutRecoveryDigest } from "@/workspaces/storefront/checkout/checkout-recovery";

export type CheckoutFlow = "whole_cake" | "fresh_pick";

export type CheckoutAttemptResolution =
  | { error: string; orderId: null }
  | { error: null; orderId: string | null };

export async function resolveCheckoutAttempt(
  formData: FormData,
  flow: CheckoutFlow,
): Promise<CheckoutAttemptResolution> {
  const requestId = String(formData.get("checkout_request_id") ?? "").trim();
  if (!isCheckoutRequestId(requestId)) {
    return { error: "Checkout retry protection could not be verified. Please refresh and try again.", orderId: null };
  }

  const recoveryDigest = await getCheckoutRecoveryDigest(flow);
  if (!recoveryDigest) {
    return { error: "Checkout recovery could not be verified. Please refresh checkout and try again.", orderId: null };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("resolve_guest_checkout_attempt_v3", {
    p_request_id: requestId,
    p_checkout_flow: flow,
    p_submission_payload: checkoutSubmissionPayload(formData),
    p_recovery_digest: recoveryDigest,
  });
  if (error) return { error: "Checkout recovery could not be verified. Please refresh checkout or contact Whitebird.", orderId: null };
  return {
    error: null,
    orderId: typeof data === "string" && data ? data : null,
  };
}
