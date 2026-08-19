/**
 * Persisted operating hours: seed schedule, venue matrix, special dates, copy.
 * Run: npx tsx scripts/test-operating-hours.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidDeliverySlot } from "@/engines/business-calendar/delivery-hours";
import {
  availableDineInVenues,
  isValidDineInSlot,
  resolveDineInSchedule,
} from "@/engines/business-calendar/dine-in-hours";
import {
  closeCapabilitiesOnDate,
  copyWeeklyDayToDate,
  customerHoursNoticeFromSnapshot,
  resolveOperatingHours,
} from "@/engines/business-calendar/operating-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import { customerPickupSlotsForDate } from "@/engines/business-calendar/order-availability";
import { getEffectivePickupSchedule } from "@/engines/business-calendar/pickup-schedule";
import {
  getPickupSlotsForDate,
  isValidPickupSlot,
} from "@/engines/business-calendar/pickup-slots";

const TUE = "2026-08-11";
const WED = "2026-08-12";
const FRI = "2026-08-14";
const SAT = "2026-08-15";
assert.equal(new Date(2026, 7, 11).getDay(), 2);
assert.equal(new Date(2026, 7, 12).getDay(), 3);
assert.equal(new Date(2026, 7, 14).getDay(), 5);
assert.equal(new Date(2026, 7, 15).getDay(), 6);

assert.deepEqual(availableDineInVenues(TUE, "16:00"), ["hyphen", "whitebird"]);
assert.deepEqual(availableDineInVenues(TUE, "17:00"), ["hyphen", "whitebird"]);
assert.deepEqual(availableDineInVenues(TUE, "17:30"), []);
assert.deepEqual(availableDineInVenues(FRI, "17:00"), ["hyphen", "whitebird"]);
assert.deepEqual(availableDineInVenues(FRI, "17:30"), ["whitebird"]);
assert.deepEqual(availableDineInVenues(FRI, "18:00"), ["whitebird"]);
assert.deepEqual(availableDineInVenues(FRI, "21:30"), ["whitebird"]);
assert.deepEqual(availableDineInVenues(FRI, "22:00"), []);
assert.equal(isValidDineInSlot(WED, "12:00"), false);
assert.equal(isValidDeliverySlot(TUE, "12:00"), true);
assert.equal(isValidDeliverySlot(TUE, "15:00"), true);
assert.equal(isValidDeliverySlot(WED, "12:00"), false);
assert.equal(isValidPickupSlot(TUE, "12:00"), true);
assert.equal(isValidPickupSlot(TUE, "17:30"), true);
assert.equal(isValidPickupSlot(WED, "15:00"), true);
assert.equal(isValidPickupSlot(WED, "15:30"), false);

const wedOpen = copyWeeklyDayToDate(OPERATING_HOURS_SEED, WED, 1, [
  "dine_in",
  "hyphen",
  "whitebird",
  "pickup",
]);
assert.equal(resolveDineInSchedule(WED, wedOpen).status, "open");
assert.deepEqual(availableDineInVenues(WED, "17:00", wedOpen), [
  "hyphen",
  "whitebird",
]);
assert.equal(isValidDeliverySlot(WED, "12:00", wedOpen), false);
assert.equal(getEffectivePickupSchedule(WED, wedOpen).status, "open");
const wedDeliveryOpen = copyWeeklyDayToDate(OPERATING_HOURS_SEED, WED, 1, [
  "delivery",
]);
assert.equal(isValidDeliverySlot(WED, "12:00", wedDeliveryOpen), true);

const wedClosed = closeCapabilitiesOnDate(OPERATING_HOURS_SEED, WED);
assert.equal(resolveDineInSchedule(WED, wedClosed).status, "closed");
assert.equal(getEffectivePickupSchedule(WED, wedClosed).status, "closed");

const hyphenTue = resolveOperatingHours(OPERATING_HOURS_SEED, "hyphen", TUE);
assert.equal(hyphenTue.enabled, true);
assert.equal(hyphenTue.opensAt, "09:00");
assert.equal(hyphenTue.latestBookable, "17:00");
const whitebirdFri = resolveOperatingHours(
  OPERATING_HOURS_SEED,
  "whitebird",
  FRI,
);
assert.equal(whitebirdFri.closesAt, "22:00");
assert.equal(whitebirdFri.latestBookable, "21:30");

const notice = customerHoursNoticeFromSnapshot(OPERATING_HOURS_SEED);
assert.match(notice, /Dine-in is available/);
assert.match(notice, /5:00pm/);
assert.match(notice, /9:30pm/);
assert.match(notice, /Delivery is available/);
assert.doesNotMatch(notice, /5:30pm–/);

const hoursMigration = readFileSync(
  resolve("supabase/migrations/20260819120000_operating_hours.sql"),
  "utf8",
);
assert.match(hoursMigration, /operating_hours_weekly/);
assert.match(hoursMigration, /operating_hours_date_overrides/);
assert.match(hoursMigration, /operating_hours_resolved/);
assert.match(hoursMigration, /_time_within_operating_hours/);
assert.doesNotMatch(hoursMigration, /if v_dow = 3 then\s+return false/);
assert.match(hoursMigration, /submit_guest_extra_order is unchanged/);

const boardSrc = readFileSync(
  resolve("src/workspaces/library/operating-hours/OperatingHoursBoard.tsx"),
  "utf8",
);
assert.match(boardSrc, /Special dates/);
assert.match(boardSrc, /saveWeeklyOperatingHoursAction/);

function slotValues(
  dateYmd: string,
  snapshot = OPERATING_HOURS_SEED,
): string[] {
  return getPickupSlotsForDate(dateYmd, snapshot).map((slot) => slot.value);
}

function customerSlotValues(
  dateYmd: string,
  snapshot = OPERATING_HOURS_SEED,
): string[] {
  return customerPickupSlotsForDate(dateYmd, [], snapshot).map(
    (slot) => slot.value,
  );
}

assert.equal(isValidPickupSlot(TUE, "12:00"), true, "weekday noon pickup");
assert.equal(isValidPickupSlot(TUE, "17:30"), true, "weekday last pickup");
assert.equal(isValidPickupSlot(TUE, "18:00"), false, "weekday after close");
assert.deepEqual(slotValues(TUE), customerSlotValues(TUE));

assert.equal(isValidPickupSlot(WED, "15:00"), true, "Wednesday last pickup");
assert.equal(isValidPickupSlot(WED, "15:30"), false, "Wednesday after close");
assert.deepEqual(slotValues(WED), customerSlotValues(WED));

assert.equal(isValidPickupSlot(SAT, "12:00"), true, "weekend noon pickup");
assert.equal(isValidPickupSlot(SAT, "21:30"), true, "weekend last pickup");
assert.equal(isValidPickupSlot(SAT, "22:00"), false, "weekend after close");
assert.deepEqual(slotValues(SAT), customerSlotValues(SAT));

const wedCopiedFromMonday = copyWeeklyDayToDate(OPERATING_HOURS_SEED, WED, 1, [
  "pickup",
]);
assert.equal(isValidPickupSlot(WED, "15:30"), false);
assert.equal(
  isValidPickupSlot(WED, "15:30", wedCopiedFromMonday),
  true,
  "dated pickup override lengthens Wednesday",
);
assert.deepEqual(
  slotValues(WED, wedCopiedFromMonday),
  customerSlotValues(WED, wedCopiedFromMonday),
  "staff and customer slots agree on a dated override",
);

const wedPickupClosed = closeCapabilitiesOnDate(OPERATING_HOURS_SEED, WED, [
  "pickup",
]);
assert.deepEqual(slotValues(WED, wedPickupClosed), []);
assert.deepEqual(customerSlotValues(WED, wedPickupClosed), []);

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

const ownerPickupSrc = readSrc("src/components/ui/OwnerPickupFields.tsx");
assert.match(ownerPickupSrc, /hoursSnapshot = OPERATING_HOURS_SEED/);
assert.match(ownerPickupSrc, /getPickupSlotsForDate\(date, hoursSnapshot\)/);
assert.match(
  ownerPickupSrc,
  /getEffectivePickupSchedule\(date, hoursSnapshot\)/,
);
assert.doesNotMatch(ownerPickupSrc, /WEEKLY_PROFILES/);
assert.doesNotMatch(ownerPickupSrc, /getPickupSlotsForDate\([^,\n]+\)/);

const pickupSlotSrc = readSrc("src/components/ui/PickupSlotFields.tsx");
assert.match(
  pickupSlotSrc,
  /customerPickupSlotsForDate\(dateYmd, closed, hoursSnapshot\)/,
);

const fulfilmentFieldsSrc = readSrc(
  "src/workspaces/owner/orders/OrderFulfilmentCreateFields.tsx",
);
assert.match(fulfilmentFieldsSrc, /hoursSnapshot=\{hoursSnapshot\}/);

const workspaceFormSrc = readSrc(
  "src/workspaces/owner/orders/OrderWorkspaceForm.tsx",
);
assert.match(workspaceFormSrc, /hoursSnapshot=\{hoursSnapshot\}/);

const staffFormSrc = readSrc(
  "src/workspaces/owner/orders/StaffGuestOrderForm.tsx",
);
assert.match(staffFormSrc, /hoursSnapshot=\{hoursSnapshot\}/);

const newOrderPageSrc = readSrc("src/app/(app)/owner/orders/new/page.tsx");
assert.match(newOrderPageSrc, /loadOperatingHoursSnapshot/);
assert.match(newOrderPageSrc, /hoursSnapshot=\{hoursSnapshot\}/);

const orderDetailSrc = readSrc("src/workspaces/owner/OwnerOrderDetail.tsx");
assert.match(orderDetailSrc, /loadOperatingHoursSnapshot/);
assert.match(orderDetailSrc, /hoursSnapshot=\{hoursSnapshot\}/);

const ownerActionsSrc = readSrc("src/workspaces/owner/orders/actions.ts");
assert.match(ownerActionsSrc, /loadOperatingHoursSnapshot/);
assert.match(
  ownerActionsSrc,
  /isValidPickupSlot\(pickupDate, pickupTime, hoursSnapshot\)/,
);

console.log("PASS operating hours");
