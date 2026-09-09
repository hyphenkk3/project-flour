/**
 * Fresh Pick same-day pickup lead: now + 1 hour, next 30-minute slot.
 * Tomorrow/later dates keep configured Extra slots. Whole-cake preorder is untouched.
 * Run: npx tsx scripts/test-extra-same-day-pickup-cutoff.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EXTRA_SAME_DAY_PICKUP_LEAD_MS,
  extraCustomerPickupSlotsForDate,
  isValidExtraCustomerPickup,
} from "@/engines/extra/extra-pickup";
import { extraPickupThroughIso } from "@/engines/extra/fresh-picks-time";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MONDAY = "2026-08-17";
const TUESDAY = "2026-08-18";

function malaysiaNow(clock: string): Date {
  const iso = `${MONDAY}T${clock}+08:00`;
  const ms = Date.parse(iso);
  assert.equal(Number.isFinite(ms), true, `invalid Malaysia clock ${clock}`);
  return new Date(ms);
}

const window = {
  pickupAvailableFromAt: extraPickupThroughIso(MONDAY, "12:00")!,
  orderCutoffAt: extraPickupThroughIso(TUESDAY, "14:00")!,
};

assert.equal(EXTRA_SAME_DAY_PICKUP_LEAD_MS, 60 * 60 * 1000);

const examples: Array<{ now: string; earliest: string }> = [
  { now: "12:00:00", earliest: "13:00" },
  { now: "12:10:00", earliest: "13:30" },
  { now: "12:29:00", earliest: "13:30" },
  { now: "12:30:00", earliest: "13:30" },
  { now: "12:31:00", earliest: "14:00" },
  { now: "12:45:00", earliest: "14:00" },
  { now: "13:00:00", earliest: "14:00" },
  { now: "13:01:00", earliest: "14:30" },
];

for (const example of examples) {
  const now = malaysiaNow(example.now);
  const values = extraCustomerPickupSlotsForDate(MONDAY, window, now).map(
    (slot) => slot.value,
  );
  assert.equal(
    values[0],
    example.earliest,
    `${example.now} MYT → earliest same-day slot ${example.earliest}`,
  );
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: MONDAY,
      pickupTime: example.earliest,
      ...window,
      now,
    }),
    true,
  );
  const hour = Number(example.earliest.slice(0, 2));
  const minute = Number(example.earliest.slice(3, 5));
  const prevMinute = minute === 0 ? 30 : 0;
  const prevHour = minute === 0 ? hour - 1 : hour;
  if (prevHour >= 12) {
    const tooSoon = `${String(prevHour).padStart(2, "0")}:${String(prevMinute).padStart(2, "0")}`;
    assert.equal(
      isValidExtraCustomerPickup({
        pickupDate: MONDAY,
        pickupTime: tooSoon,
        ...window,
        now,
      }),
      false,
      `${example.now} MYT must reject stale same-day ${tooSoon}`,
    );
  }
}

{
  const lateAfternoon = malaysiaNow("16:00:00");
  const todaySlots = extraCustomerPickupSlotsForDate(
    MONDAY,
    window,
    lateAfternoon,
  ).map((slot) => slot.value);
  assert.equal(todaySlots[0], "17:00");
  assert.equal(todaySlots.includes("16:00"), false);
  assert.equal(todaySlots.includes("16:30"), false);
}

{
  const now = malaysiaNow("15:10:00");
  const tomorrowSlots = extraCustomerPickupSlotsForDate(
    TUESDAY,
    window,
    now,
  ).map((slot) => slot.value);
  assert.equal(
    tomorrowSlots[0],
    "12:00",
    "tomorrow must not apply the same-day +1-hour rule",
  );
  assert.equal(tomorrowSlots.includes("12:30"), true);
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: TUESDAY,
      pickupTime: "12:00",
      ...window,
      now,
    }),
    true,
  );
}

{
  const morning = malaysiaNow("10:15:00");
  const todaySlots = extraCustomerPickupSlotsForDate(
    MONDAY,
    window,
    morning,
  ).map((slot) => slot.value);
  assert.equal(
    todaySlots[0],
    "12:00",
    "before bakery hours, same-day still starts at configured pickup-from when +1 hour is earlier",
  );
}

const extraPickupSrc = readSrc("src/engines/extra/extra-pickup.ts");
assert.match(extraPickupSrc, /EXTRA_SAME_DAY_PICKUP_LEAD_MS/);
assert.match(extraPickupSrc, /extraCustomerSlotFloorMs/);
assert.match(extraPickupSrc, /dateYmd === toBusinessDateKey\(now\)/);

const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
assert.match(extraActionsSrc, /isValidExtraCustomerPickup/);
assert.doesNotMatch(extraActionsSrc, /now:/);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
assert.match(extraFormSrc, /extraCustomerPickupSlotsForDate/);

const checkoutSlotsSrc = readSrc(
  "src/engines/business-calendar/pickup-slots.ts",
);
assert.doesNotMatch(checkoutSlotsSrc, /EXTRA_SAME_DAY_PICKUP_LEAD_MS/);
assert.doesNotMatch(checkoutSlotsSrc, /extraCustomerPickupSlotsForDate/);

const checkoutFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(checkoutFormSrc, /getPickupSlotsForDate/);
assert.doesNotMatch(checkoutFormSrc, /extraCustomerPickupSlotsForDate/);
assert.doesNotMatch(checkoutFormSrc, /EXTRA_SAME_DAY_PICKUP_LEAD_MS/);

const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
assert.match(checkoutActionsSrc, /isValidPickupSlot/);
assert.doesNotMatch(checkoutActionsSrc, /isValidExtraCustomerPickup/);
assert.doesNotMatch(checkoutActionsSrc, /EXTRA_SAME_DAY_PICKUP_LEAD_MS/);

console.log("PASS Fresh Pick same-day pickup cutoff");
