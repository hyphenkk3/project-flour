export const CHECKOUT_OUTCOME_UNCERTAIN_MESSAGE =
  "We couldn’t confirm whether your order was placed. Please don’t submit again yet. Contact Whitebird so the team can check for your order.";

export function isDefinitivePostgresFailure(code) {
  if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) return false;
  // Connection failures and explicitly unknown completion must never be
  // presented as a safe-to-retry transaction rejection.
  if (code.startsWith("08") || code === "40003" || code.startsWith("57P0")) {
    return false;
  }
  return true;
}

export async function invokeGuestCheckoutAction(action, initialState, formData) {
  try {
    const result = await action(initialState, formData);
    if (result?.orderId || result?.error || result?.outcomeUncertain) {
      return result;
    }
  } catch {
    // A transport/action exception may occur after the database committed.
  }
  return {
    error: CHECKOUT_OUTCOME_UNCERTAIN_MESSAGE,
    outcomeUncertain: true,
  };
}
