/**
 * Dine-in reservation start vs cake serving window (30-minute grid, max 60 minutes).
 * Run: npx tsx scripts/test-dine-in-reservation-serving-window.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDeliverySlotsForDate } from "@/engines/business-calendar/delivery-hours";
import {
  cakeServingSlotsForReservation,
  isCakeServingWithinReservationWindow,
  isValidDineInReservationPair,
  isValidDineInSlot,
} from "@/engines/business-calendar/dine-in-hours";
import { copyWeeklyDayToDate } from "@/engines/business-calendar/operating-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import { customerPickupSlotsForDate } from "@/engines/business-calendar/order-availability";

const THU = "2026-08-20";
assert.equal(new Date(2026, 7, 20).getDay(), 4);

function servingValues(reservation: string): string[] {
  return cakeServingSlotsForReservation(
    THU,
    reservation,
    OPERATING_HOURS_SEED,
  ).map((slot) => slot.value);
}

assert.equal(isCakeServingWithinReservationWindow("14:00", "14:00"), true);
assert.equal(isCakeServingWithinReservationWindow("14:00", "14:30"), true);
assert.equal(isCakeServingWithinReservationWindow("14:00", "15:00"), true);
assert.equal(isCakeServingWithinReservationWindow("14:00", "15:30"), false);
assert.equal(isCakeServingWithinReservationWindow("14:30", "15:30"), true);
assert.equal(isCakeServingWithinReservationWindow("15:00", "16:00"), true);
assert.equal(isCakeServingWithinReservationWindow("15:00", "16:30"), false);
assert.equal(isCakeServingWithinReservationWindow("15:00", "14:30"), false);

assert.deepEqual(servingValues("14:00"), ["14:00", "14:30", "15:00"]);
assert.ok(servingValues("14:30").includes("15:30"));
assert.ok(!servingValues("14:00").includes("15:30"));
assert.ok(!servingValues("15:00").includes("16:30"));

function pair(
  reservation: string,
  serving: string,
  venue: "hyphen" | "whitebird" = "whitebird",
) {
  return isValidDineInReservationPair({
    dateYmd: THU,
    reservationTime: reservation,
    servingTime: serving,
    venue,
    snapshot: OPERATING_HOURS_SEED,
  });
}

assert.equal(pair("14:00", "14:00"), true);
assert.equal(pair("14:00", "14:30"), true);
assert.equal(pair("14:00", "15:00"), true);
assert.equal(pair("14:00", "15:30"), false);
assert.equal(pair("14:30", "15:30"), true);
assert.equal(pair("15:00", "16:00"), true);
assert.equal(pair("15:00", "16:30"), false);
assert.equal(pair("15:00", "14:30"), false);
assert.equal(pair("14:00", "15:00", "hyphen"), true);

const WED = "2026-08-26";
assert.equal(new Date(2026, 7, 26).getDay(), 3);
assert.equal(isValidDineInSlot(WED, "14:00", OPERATING_HOURS_SEED), false);
assert.equal(
  isValidDineInReservationPair({
    dateYmd: WED,
    reservationTime: "14:00",
    servingTime: "14:00",
    venue: "whitebird",
    snapshot: OPERATING_HOURS_SEED,
  }),
  false,
);

const wedOpen = copyWeeklyDayToDate(OPERATING_HOURS_SEED, WED, 4, [
  "dine_in",
  "hyphen",
  "whitebird",
]);
assert.equal(isValidDineInSlot(WED, "14:00", wedOpen), true);
assert.equal(
  isValidDineInReservationPair({
    dateYmd: WED,
    reservationTime: "14:00",
    servingTime: "15:00",
    venue: "whitebird",
    snapshot: wedOpen,
  }),
  true,
);

const pickupSlots = customerPickupSlotsForDate(
  THU,
  [],
  OPERATING_HOURS_SEED,
).map((slot) => slot.value);
assert.ok(pickupSlots.includes("17:30"));
const deliverySlots = getDeliverySlotsForDate(THU, OPERATING_HOURS_SEED).map(
  (slot) => slot.value,
);
assert.deepEqual(deliverySlots.slice(-1), ["15:00"]);
assert.ok(!deliverySlots.includes("15:30"));

const checkoutSrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx"),
  "utf8",
);
assert.match(checkoutSrc, /Dine-in reservation time/);
assert.match(checkoutSrc, /Cake serving time/);
assert.match(checkoutSrc, /timeName="reservation_time"/);

const extraSrc = readFileSync(
  resolve("src/workspaces/storefront/extra/GuestExtraOrderForm.tsx"),
  "utf8",
);
assert.doesNotMatch(extraSrc, /fulfilment_method/);
assert.doesNotMatch(extraSrc, /reservation_time/);

const actionsSrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/actions.ts"),
  "utf8",
);
assert.match(actionsSrc, /reservation_time: reservationTime/);
assert.match(actionsSrc, /isValidDineInReservationPair/);

const sqlSrc = readFileSync(
  resolve(
    "supabase/migrations/20260819140000_dine_in_reservation_serving_window.sql",
  ),
  "utf8",
);
assert.match(sqlSrc, /is_valid_dine_in_serving_window/);
assert.match(sqlSrc, /v_dine ->> 'reservation_time'/);
assert.match(sqlSrc, /v_reservation, v_venue, v_guest/);

const workspaceSrc = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);
assert.match(workspaceSrc, /Dine-in reservation time/);
assert.match(workspaceSrc, /Cake serving time/);
assert.match(workspaceSrc, /name="reservation_time"/);

const hoursActionsSrc = readFileSync(
  resolve("src/workspaces/library/operating-hours/actions.ts"),
  "utf8",
);
assert.match(hoursActionsSrc, /requireLibraryStaff/);
assert.match(hoursActionsSrc, /saveWeeklyOperatingHoursAction/);

console.log("PASS dine-in reservation serving window");
