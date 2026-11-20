import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CHECKOUT_OUTCOME_UNCERTAIN_MESSAGE,
  isDefinitivePostgresFailure,
  invokeGuestCheckoutAction,
} from "../src/workspaces/storefront/checkout/submit-action-outcome.mjs";
import {
  clearUncertainSubmit,
  hasUncertainSubmit,
  setUncertainSubmit,
} from "../src/workspaces/storefront/checkout/uncertain-submit-lock.mjs";
import {
  clearFreshPickCheckoutAttempt,
  freshPickSubmissionPayload,
  getOrCreateFreshPickCheckoutAttempt,
  parseFreshPickCheckoutAttempt,
} from "../src/workspaces/storefront/extra/fresh-pick-checkout-attempt.mjs";

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

const rejected = await invokeGuestCheckoutAction(async () => ({
  error: "Fully Booked",
}), {}, new FormData());
assert.equal(rejected.error, "Fully Booked");
assert.equal(rejected.outcomeUncertain, undefined);

const thrown = await invokeGuestCheckoutAction(async () => {
  throw new Error("transport ended after request dispatch");
}, {}, new FormData());
assert.equal(thrown.error, CHECKOUT_OUTCOME_UNCERTAIN_MESSAGE);
assert.equal(thrown.outcomeUncertain, true);

const emptySuccess = await invokeGuestCheckoutAction(async () => ({ error: null }), {}, new FormData());
assert.equal(emptySuccess.outcomeUncertain, true);
assert.equal(isDefinitivePostgresFailure("P0001"), true);
assert.equal(isDefinitivePostgresFailure("57014"), true);
assert.equal(isDefinitivePostgresFailure("40003"), false);
assert.equal(isDefinitivePostgresFailure("08006"), false);
assert.equal(isDefinitivePostgresFailure("57P01"), false);
assert.equal(isDefinitivePostgresFailure("PGRST202"), false);
assert.equal(isDefinitivePostgresFailure(undefined), false);
const cryptoStub = {
  randomUUID: () => "b96e49e9-1b72-4d0b-aed4-3704453f62ef",
  getRandomValues: (bytes) => bytes.fill(0xab),
};
const firstAttempt = getOrCreateFreshPickCheckoutAttempt(storage, cryptoStub);
const sameAttempt = getOrCreateFreshPickCheckoutAttempt(storage, {
  randomUUID: () => "a96e49e9-1b72-4d0b-aed4-3704453f62ef",
  getRandomValues: (bytes) => bytes.fill(0xcd),
});
assert.deepEqual(sameAttempt, firstAttempt, "session reuses the same request and recovery capability");
assert.equal(firstAttempt.recoveryDigest.length, 64);
assert.equal(parseFreshPickCheckoutAttempt("invalid"), null);
const checkoutForm = new FormData();
checkoutForm.append("extra_stock_id", "synthetic-stock");
checkoutForm.append("perf_correlation_id", "transient-diagnostic-id");
checkoutForm.append("checkout_request_id", firstAttempt.requestId);
checkoutForm.append("checkout_recovery_digest", firstAttempt.recoveryDigest);
const payload = freshPickSubmissionPayload(checkoutForm);
assert.deepEqual(payload, { version: 1, fields: [["extra_stock_id", "synthetic-stock"]] });
clearFreshPickCheckoutAttempt(storage);
assert.equal(storage.getItem("whitebird-fresh-pick-checkout-attempt-v1"), null);

const committedWithFollowupError = await invokeGuestCheckoutAction(async () => ({
  error: "Optional post-submit step failed",
  orderId: "synthetic-order-id",
}), {}, new FormData());
assert.equal(committedWithFollowupError.orderId, "synthetic-order-id");

assert.equal(hasUncertainSubmit("fresh-pick", storage), false);
setUncertainSubmit("fresh-pick", storage);
assert.equal(hasUncertainSubmit("fresh-pick", storage), true);
assert.equal(hasUncertainSubmit("preorder", storage), false);
clearUncertainSubmit("fresh-pick", storage);
assert.equal(hasUncertainSubmit("fresh-pick", storage), false);

const [extraActions, confirm, preorder, freshPick] = await Promise.all([
  readFile(new URL("../src/workspaces/storefront/extra/actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/workspaces/storefront/checkout/CheckoutConfirmPrompt.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/workspaces/storefront/checkout/GuestCheckoutForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx", import.meta.url), "utf8"),
]);

assert.match(extraActions, /resolve_guest_checkout_attempt_v3/);
assert.match(extraActions, /submit_guest_extra_order_idempotent_v3/);
assert.match(extraActions, /createServiceClient\(\)/);
assert.doesNotMatch(extraActions.slice(extraActions.indexOf("async function submitGuestExtraOrderActionBody")), /getStorefrontExtraById|library_cake_photos|extraPhotosByCake/);
assert.match(confirm, /role="alert"/);
assert.match(confirm, /Check this submission safely/);
assert.match(confirm, /onRecoverUncertain/);
assert.match(preorder, /submitOutcomeUncertain/);
assert.match(freshPick, /submitOutcomeUncertain/);
assert.match(preorder, /confirmInFlightRef\.current = true/);
assert.match(freshPick, /confirmInFlightRef\.current = true/);
assert.match(
  freshPick,
  /function verifyNoOrderAndResume\(\)[\s\S]*?clearUncertainSubmit\("fresh-pick"\);\s*clearFreshPickCheckoutAttempt\(\);/,
  "a manually verified no-order outcome must start a fresh idempotency attempt",
);

console.log("P0_CHECKOUT_FAILURE_PATH=PASS");
console.log("confirmed_rejection=retryable; uncertain_response=blocked_and_persisted; sqlstate=definitive");
console.log("fresh_pick_submit_validation=stock_and_fulfilment_only; authoritative_rpc=preserved");
