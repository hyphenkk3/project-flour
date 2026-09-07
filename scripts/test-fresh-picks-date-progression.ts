/**
 * Customer-facing Fresh Pick pickup-date progression.
 * Configured offering dates are not all visible from the first day.
 * Run: npx tsx scripts/test-fresh-picks-date-progression.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isExtraAvailable } from "@/engines/extra/availability";
import {
  extraActionableFreshPickDays,
  homepageFreshPicksAvailabilityLines,
  isPublishedFreshPick,
} from "@/engines/extra/customer-fresh-picks";
import {
  extraCustomerVisiblePickupDates,
  extraOrderablePickupDates,
  extraPickupDates,
  isValidExtraCustomerPickup,
} from "@/engines/extra/extra-pickup";
import { extraPickupThroughIso } from "@/engines/extra/fresh-picks-time";

const SEP7 = "2026-09-07";
const SEP8 = "2026-09-08";
const SEP9 = "2026-09-09";
const SEP10 = "2026-09-10";

function morningOn(ymd: string): Date {
  return new Date(`${ymd}T02:15:00.000Z`);
}

const window89 = {
  pickupAvailableFromAt: extraPickupThroughIso(SEP8, "12:00")!,
  orderCutoffAt: extraPickupThroughIso(SEP9, "14:00")!,
};

assert.deepEqual(extraPickupDates(window89), [SEP8, SEP9]);

{
  const now = morningOn(SEP7);
  assert.deepEqual(
    extraOrderablePickupDates(window89, now),
    [SEP8, SEP9],
    "configured remaining slots still include both offering dates",
  );
  assert.deepEqual(
    extraCustomerVisiblePickupDates(window89, now),
    [SEP8],
    "1. 7 Sep: only the first upcoming offering date is customer-visible",
  );
  assert.equal(
    extraCustomerVisiblePickupDates(window89, now).includes(SEP9),
    false,
  );
  assert.deepEqual(
    extraActionableFreshPickDays({
      pickupAvailableFromAt: window89.pickupAvailableFromAt,
      orderCutoffAt: window89.orderCutoffAt,
      todayYmd: SEP7,
      now,
    }),
    ["tomorrow"],
    "7. homepage listing horizon stays tomorrow-only on 7 Sep",
  );
  assert.deepEqual(
    homepageFreshPicksAvailabilityLines(["tomorrow"], SEP7),
    ["1 cake available tomorrow · 8 SEP"],
  );
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: SEP8,
      pickupTime: "12:00",
      ...window89,
      now,
    }),
    true,
  );
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: SEP9,
      pickupTime: "12:00",
      ...window89,
      now,
    }),
    false,
    "9 Sep is not selectable on 7 Sep",
  );
}

{
  const now = morningOn(SEP8);
  assert.deepEqual(
    extraCustomerVisiblePickupDates(window89, now),
    [SEP8, SEP9],
    "2. 8 Sep: current offering date and the next date are visible",
  );
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: SEP8,
      pickupTime: "12:00",
      ...window89,
      now,
    }),
    true,
  );
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: SEP9,
      pickupTime: "12:00",
      ...window89,
      now,
    }),
    true,
  );
  assert.deepEqual(
    extraActionableFreshPickDays({
      pickupAvailableFromAt: window89.pickupAvailableFromAt,
      orderCutoffAt: window89.orderCutoffAt,
      todayYmd: SEP8,
      now,
    }),
    ["today", "tomorrow"],
  );
}

{
  const now = morningOn(SEP9);
  assert.deepEqual(
    extraCustomerVisiblePickupDates(window89, now),
    [SEP9],
    "3. 9 Sep: past 8 Sep is hidden; only 9 Sep remains",
  );
  assert.equal(
    extraCustomerVisiblePickupDates(window89, now).includes(SEP8),
    false,
  );
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: SEP8,
      pickupTime: "12:00",
      ...window89,
      now,
    }),
    false,
    "4. past Fresh Pick dates are not selectable",
  );
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: SEP9,
      pickupTime: "12:00",
      ...window89,
      now,
    }),
    true,
  );
}

{
  const afterTuesdayHours = new Date("2026-09-08T09:45:00.000Z");
  assert.deepEqual(
    extraCustomerVisiblePickupDates(window89, afterTuesdayHours),
    [SEP9],
    "5. exhausted 8 Sep slots follow remaining bakery hours; 9 Sep stays if still available",
  );
}

{
  const soldNow = morningOn(SEP8);
  assert.equal(
    isPublishedFreshPick({
      lifecycle: "confirmed",
      pickupThroughAt: window89.orderCutoffAt,
      soldAt: "2026-09-08T02:00:00.000Z",
      now: soldNow,
    }),
    false,
    "5. sold-out Extra stays hidden by existing sold_at / availability rules",
  );
  assert.equal(
    isExtraAvailable({
      lifecycle: "confirmed",
      pickupThroughAt: window89.orderCutoffAt,
      soldAt: "2026-09-08T02:00:00.000Z",
      now: soldNow,
    }),
    false,
  );
}

{
  const single = {
    pickupAvailableFromAt: extraPickupThroughIso(SEP8, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(SEP8, "17:30")!,
  };
  assert.deepEqual(extraPickupDates(single), [SEP8]);
  assert.deepEqual(
    extraCustomerVisiblePickupDates(single, morningOn(SEP7)),
    [SEP8],
    "6. single-day Fresh Pick still exposes only that date before it",
  );
  assert.deepEqual(
    extraCustomerVisiblePickupDates(single, morningOn(SEP8)),
    [SEP8],
    "6. single-day Fresh Pick still exposes that date on the day",
  );
  assert.deepEqual(
    extraCustomerVisiblePickupDates(single, morningOn(SEP9)),
    [],
    "6. single-day Fresh Pick disappears after that date",
  );
}

{
  const threeDay = {
    pickupAvailableFromAt: extraPickupThroughIso(SEP8, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(SEP10, "14:00")!,
  };
  assert.deepEqual(extraPickupDates(threeDay), [SEP8, SEP9, SEP10]);
  assert.deepEqual(
    extraCustomerVisiblePickupDates(threeDay, morningOn(SEP7)),
    [SEP8],
  );
  assert.deepEqual(
    extraCustomerVisiblePickupDates(threeDay, morningOn(SEP8)),
    [SEP8, SEP9],
    "later window dates stay hidden until the current offering date arrives",
  );
  assert.deepEqual(
    extraCustomerVisiblePickupDates(threeDay, morningOn(SEP9)),
    [SEP9, SEP10],
  );
  assert.deepEqual(
    extraCustomerVisiblePickupDates(threeDay, morningOn(SEP10)),
    [SEP10],
  );
}

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraQueriesSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
const extraPickupSrc = readSrc("src/engines/extra/extra-pickup.ts");
const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
const extraCardSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontFreshPicksCard.tsx",
);
const checkoutSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);

assert.match(extraPickupSrc, /extraCustomerVisiblePickupDates/);
assert.match(extraFormSrc, /extraCustomerVisiblePickupDates/);
assert.match(extraFormSrc, /FRESH_PICKS_FIXED_DATES_NOTE/);
assert.doesNotMatch(extraFormSrc, /extraOrderablePickupDates/);
assert.match(extraQueriesSrc, /extraActionableFreshPickDays/);
assert.match(extraQueriesSrc, /extraCustomerVisiblePickupDates/);
assert.match(extraPageSrc, /freshPickAvailabilityDateLabel/);
assert.match(extraPageSrc, /freshPickAvailabilityLabel\(pick\.days\)/);
assert.match(extraCardSrc, /homepageFreshPicksAvailabilityLines/);
assert.doesNotMatch(extraCardSrc, /extraCustomerVisiblePickupDates/);
assert.doesNotMatch(extraPageSrc, /extraCustomerVisiblePickupDates/);
assert.doesNotMatch(checkoutSrc, /extraCustomerVisiblePickupDates/);
assert.doesNotMatch(checkoutSrc, /extraOrderablePickupDates/);
assert.doesNotMatch(extraFormSrc, /earliestPickupDateYmd/);
assert.doesNotMatch(extraFormSrc, /evaluateCollectionDate/);
assert.doesNotMatch(extraPickupSrc, /preorder_days/);

console.log("PASS Fresh Picks customer date progression");
