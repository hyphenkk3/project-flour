import type { CheckoutRecoveryFlow } from "@/workspaces/storefront/checkout/checkout-recovery";

export async function ensureCheckoutRecoveryCookie(
  flow: CheckoutRecoveryFlow,
): Promise<boolean> {
  try {
    const response = await fetch("/api/guest-checkout/recovery", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json",
      },
      body: JSON.stringify({ flow }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
