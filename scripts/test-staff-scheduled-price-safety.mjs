import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cakeSizePriceRequestKey,
  isCurrentCakeSizePriceResponse,
  newlyPricedCakeSizeIds,
  verifiedSelectedCakeSizePrices,
  verifiedStaffCakeSizeSubmission,
} from "../src/workspaces/owner/orders/pickup-date-cake-size-prices.ts";

const date1 = "2026-10-14";
const date2 = "2026-10-15";
const sizeIds = ["size-b", "size-a"];
const key1 = cakeSizePriceRequestKey(date1, sizeIds);
const key2 = cakeSizePriceRequestKey(date2, sizeIds);
assert.equal(key1, "2026-10-14|size-a,size-b");
assert.notEqual(key1, key2);

const verified = (pickupDate, status, prices, ids = ["size-a"]) =>
  verifiedSelectedCakeSizePrices({ pickupDate, sizeIds: ids, status, prices });
assert.equal(verified(date1, "ready", { "size-a": 140 }), true);
assert.equal(verified(date1, "loading", { "size-a": 140 }), false);
assert.equal(verified(date1, "error", { "size-a": 140 }), false);
assert.equal(verified(date1, "ready", {}), false);
assert.equal(verified(date1, "ready", { "size-a": Number.NaN }), false);
assert.equal(verified(date1, "ready", { "size-a": 135 }), true); // Authoritative base-price result.
assert.equal(verified("", "ready", { "size-a": 140 }), false);

let finishOld;
const delayed = new Promise((resolve) => {
  finishOld = resolve;
});
let currentKey = key1;
let currentAttempt = 0;
const oldResponse = delayed.then((prices) =>
  isCurrentCakeSizePriceResponse({
    responseKey: key1,
    responseAttempt: 0,
    currentKey,
    currentAttempt,
  })
    ? prices
    : null,
);
currentKey = key2;
assert.equal(verified(date2, "loading", {}), false);
finishOld({ "size-a": 140 });
assert.equal(await oldResponse, null); // Date changed before old request completed.
currentAttempt = 1;
assert.equal(
  isCurrentCakeSizePriceResponse({
    responseKey: key2,
    responseAttempt: 0,
    currentKey,
    currentAttempt,
  }),
  false,
); // Old failed attempt cannot overwrite retry.
assert.equal(
  isCurrentCakeSizePriceResponse({
    responseKey: key2,
    responseAttempt: 1,
    currentKey,
    currentAttempt,
  }),
  true,
);
assert.equal(verified(date2, "ready", { "size-a": 150 }), true);

const submitted = new FormData();
submitted.set("pickup_date", date2);
submitted.set("items_json", '[{"cakeSizeId":"size-a"}]');
const submission = (verified, formData = submitted) =>
  verifiedStaffCakeSizeSubmission({
    verified,
    formData,
    pickupDate: date2,
    itemsJson: '[{"cakeSizeId":"size-a"}]',
  });
assert.equal(submission(true), true);
assert.equal(submission(false), false);
submitted.set("pickup_date", date1);
assert.equal(submission(true), false);
submitted.set("pickup_date", date2);
submitted.set("items_json", "[]");
assert.equal(submission(true), false);

const saved = [{ id: "old", cakeId: "cake", cakeSizeId: "size-a" }];
assert.deepEqual(
  newlyPricedCakeSizeIds(
    [{ itemId: "old", cakeId: "cake", cakeSizeId: "size-a" }],
    saved,
  ),
  [],
);
assert.equal(verified(date1, "loading", {}, []), true); // Notes-only amendment.
assert.deepEqual(
  newlyPricedCakeSizeIds(
    [
      { itemId: "old", cakeId: "cake", cakeSizeId: "size-a" },
      { cakeId: "cake", cakeSizeId: "size-b" },
    ],
    saved,
  ),
  ["size-b"],
);
assert.deepEqual(
  newlyPricedCakeSizeIds(
    [{ itemId: "old", cakeId: "cake", cakeSizeId: "size-b" }],
    saved,
  ),
  ["size-b"],
);

for (const path of [
  "src/workspaces/owner/orders/StaffGuestOrderForm.tsx",
  "src/workspaces/customer-operations/orders/AssistedOrderForm.tsx",
  "src/workspaces/owner/orders/OrderWorkspaceForm.tsx",
]) {
  const source = readFileSync(path, "utf8");
  assert.match(source, /Checking price…/);
  assert.match(source, /Price unavailable/);
  assert.match(source, /Retry prices/);
  assert.match(source, /disabled=\{!cakePriceVerified\}/);
  assert.match(source, /if \(!cakePriceVerified\) event.preventDefault\(\)/);
  assert.match(source, /verifiedStaffCakeSizeSubmission/);
  assert.doesNotMatch(source, /displayCakeSizeUnitPrice\(/);
}

console.log(
  "PASS staff scheduled-price loading, failure, retry, stale response, and amendment guards",
);
