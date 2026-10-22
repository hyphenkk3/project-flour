import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  checkoutSubmissionPayload,
  isCheckoutRequestId,
} from "@/workspaces/storefront/checkout/checkout-attempt";

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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_guest_checkout_attempt", {
    p_request_id: requestId,
    p_checkout_flow: flow,
    p_submission_payload: checkoutSubmissionPayload(formData),
  });
  if (error) return { error: error.message, orderId: null };
  return {
    error: null,
    orderId: typeof data === "string" && data ? data : null,
  };
}
