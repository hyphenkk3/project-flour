import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export type CheckoutRecoveryFlow = "whole_cake" | "fresh_pick";
export const GUEST_CHECKOUT_RECOVERY_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

// This HttpOnly capability is stable for the active checkout attempt/recovery
// window. It is deliberately not rotated on submission: a lost response must
// still be recoverable with the same browser cookie. The server-side verifier
// expires at the same 90-day boundary. Once a receipt is returned, the form
// clears its attempt draft; a new purchase gets a new request ID. Expired
// attempts fail closed and require a fresh checkout rather than being claimed.

const RECOVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isCheckoutRecoveryToken(value: unknown): value is string {
  return typeof value === "string" && RECOVERY_TOKEN_PATTERN.test(value);
}

export function checkoutRecoveryDigest(token: string): string {
  if (!isCheckoutRecoveryToken(token)) {
    throw new Error("Checkout recovery is unavailable.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function guestCheckoutRecoveryCookieName(flow: CheckoutRecoveryFlow): string {
  return flow === "whole_cake"
    ? "wb_guest_checkout_recovery_whole"
    : "wb_guest_checkout_recovery_fresh";
}

export async function getCheckoutRecoveryDigest(
  flow: CheckoutRecoveryFlow,
): Promise<string | null> {
  const token = (await cookies()).get(guestCheckoutRecoveryCookieName(flow))?.value;
  if (!isCheckoutRecoveryToken(token)) return null;
  return checkoutRecoveryDigest(token);
}
