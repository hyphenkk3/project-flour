import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSecondaryOfferLoader } from "../src/workspaces/storefront/checkout/secondary-offer-loader.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const states = [];
const success = [];
const optionalChoices = [{ code: "gift-box", unitPrice: 8 }];
const successfulLoader = createSecondaryOfferLoader({
  pickupDate: "2026-11-10",
  load: async () => ({ options: optionalChoices }),
  isCurrent: () => true,
  onState: (state) => states.push(state),
  onSuccess: (result) => success.push(result),
});
await successfulLoader.run();
assert.equal(states.at(-1).status, "ready");
assert.deepEqual(success.at(-1).options, optionalChoices);

const emptyStates = [];
const emptyLoader = createSecondaryOfferLoader({
  pickupDate: "2026-11-10",
  load: async () => ({ options: [] }),
  isCurrent: () => true,
  onState: (state) => emptyStates.push(state),
  onSuccess: () => {},
});
await emptyLoader.run();
assert.equal(
  emptyStates.at(-1).status,
  "ready",
  "empty is a successful result",
);

let attempt = 0;
const retryStates = [];
const retried = [];
const preservedCheckout = {
  cart: [{ cakeId: "yam", quantity: 1, unitPrice: 135 }],
  pickupDate: "2026-11-10",
  customerName: "Synthetic Test",
  paidTotal: 135,
};
const checkoutSnapshot = structuredClone(preservedCheckout);
const retryLoader = createSecondaryOfferLoader({
  pickupDate: "2026-11-10",
  load: async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("57014 statement timeout");
    return { options: optionalChoices };
  },
  isCurrent: () => true,
  onState: (state) => retryStates.push(state),
  onSuccess: (result) => retried.push(result),
});
await retryLoader.run();
assert.equal(retryStates.at(-1).status, "error");
assert.equal(retried.length, 0, "failed optional read does not apply choices");
assert.deepEqual(
  preservedCheckout,
  checkoutSnapshot,
  "failed optional read preserves cart, price, date and entered details",
);
await retryLoader.run();
assert.equal(attempt, 2, "retry performs only the failed read");
assert.equal(retryStates.at(-1).status, "ready");
assert.deepEqual(retried.at(-1).options, optionalChoices);
assert.deepEqual(
  preservedCheckout,
  checkoutSnapshot,
  "retry does not mutate checkout draft or price",
);

let concurrentCalls = 0;
const inFlight = deferred();
const dedupeLoader = createSecondaryOfferLoader({
  pickupDate: "2026-11-10",
  load: () => {
    concurrentCalls += 1;
    return inFlight.promise;
  },
  isCurrent: () => true,
  onState: () => {},
  onSuccess: () => {},
});
const first = dedupeLoader.run();
const repeated = dedupeLoader.run();
assert.equal(concurrentCalls, 0, "load starts in a microtask");
await Promise.resolve();
assert.equal(concurrentCalls, 1);
assert.equal(first, repeated, "simultaneous retry clicks share one request");
inFlight.resolve({ options: [] });
await first;

let currentDate = "2026-11-10";
const staleStates = [];
let staleSuccesses = 0;
const staleRequest = deferred();
const staleLoader = createSecondaryOfferLoader({
  pickupDate: "2026-11-10",
  load: () => staleRequest.promise,
  isCurrent: (date) => date === currentDate,
  onState: (state) => staleStates.push(state),
  onSuccess: () => {
    staleSuccesses += 1;
  },
});
const pending = staleLoader.run();
await Promise.resolve();
currentDate = "2026-11-11";
staleRequest.resolve({ options: optionalChoices });
await pending;
assert.equal(staleSuccesses, 0, "old-date response is discarded");
assert.equal(
  staleStates.at(-1).status,
  "loading",
  "stale completion adds no current-date state",
);

let cancelledSuccess = false;
const cancelledRequest = deferred();
const cancelledLoader = createSecondaryOfferLoader({
  pickupDate: "2026-11-10",
  load: () => cancelledRequest.promise,
  isCurrent: () => true,
  onState: () => {},
  onSuccess: () => {
    cancelledSuccess = true;
  },
});
const cancelledPending = cancelledLoader.run();
await Promise.resolve();
cancelledLoader.cancel();
cancelledRequest.resolve({ options: optionalChoices });
await cancelledPending;
assert.equal(
  cancelledSuccess,
  false,
  "unmounted/date-cleaned request cannot update state",
);

const component = await readFile(
  new URL(
    "../src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
    import.meta.url,
  ),
  "utf8",
);
assert.match(
  component,
  /We couldn’t load the optional cake and add-on choices/,
);
assert.match(component, /Try Again[\s\S]*?type="button"/);
assert.match(component, /retrySecondaryOfferRef\.current\?\.\(\)/);
assert.match(component, /onSuccess: \(fullOffer, requestDate\)/);
assert.ok(
  component.includes('requestKey: `${pickupDate}|${cakeIds.join(",")}`'),
);
assert.match(
  component,
  /resolvedOptionsDate === fields\.pickupDate\.trim\(\)\.slice\(0, 10\)/,
);
assert.match(component, /value=\{optionsReadyForSelectedDate \? "1" : "0"\}/);
assert.match(
  component,
  /loadCheckoutDateConfirmation\(/,
  "required confirmation remains separate",
);
assert.doesNotMatch(
  await readFile(
    new URL(
      "../src/workspaces/storefront/checkout/secondary-offer-loader.mjs",
      import.meta.url,
    ),
    "utf8",
  ),
  /submitGuest|payment|FormData/,
);

console.log(
  "PASS: secondary checkout offer success, empty result, timeout/retry, deduplication, stale-date and cancellation checks",
);
