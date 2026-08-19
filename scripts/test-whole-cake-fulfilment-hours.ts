/**
 * Whole Cake Dine-in / Delivery customer hour windows.
 * Run: npx tsx scripts/test-whole-cake-fulfilment-hours.ts
 */
import assert from "node:assert/strict";
import {
  getDeliverySchedule,
  isValidDeliverySlot,
} from "@/engines/business-calendar/delivery-hours";
import {
  closeCapabilitiesOnDate,
  copyWeeklyDayToDate,
} from "@/engines/business-calendar/operating-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  isValidDineInSlot,
  parseGuestCount,
  resolveDineInSchedule,
} from "@/engines/business-calendar/dine-in-hours";
import { rangeSlotsInclusive } from "@/engines/business-calendar/pickup-schedule";

function ymdForWeekday(weekday: number): string {
  const day = 9 + weekday;
  return `2026-08-${String(day).padStart(2, "0")}`;
}

const MON = ymdForWeekday(1);
const TUE = ymdForWeekday(2);
const WED = ymdForWeekday(3);
const THU = ymdForWeekday(4);
const FRI = ymdForWeekday(5);
const SAT = ymdForWeekday(6);
const SUN = ymdForWeekday(0);

assert.equal(new Date(2026, 7, 10).getDay(), 1);
assert.equal(new Date(2026, 7, 12).getDay(), 3);

function assertOpen(
  date: string,
  start: string,
  end: string,
  fn: (d: string, t: string) => boolean,
  label: string,
) {
  assert.equal(fn(date, start), true, `${label} ${start}`);
  assert.equal(fn(date, end), true, `${label} ${end}`);
  const before = rangeSlotsInclusive("00:00", "11:30");
  assert.equal(fn(date, "11:30"), false, `${label} before open`);
}

assertOpen(MON, "12:00", "17:00", isValidDineInSlot, "Mon dine-in");
assertOpen(TUE, "12:00", "17:00", isValidDineInSlot, "Tue dine-in");
assertOpen(THU, "12:00", "17:00", isValidDineInSlot, "Thu dine-in");
assertOpen(FRI, "12:00", "21:30", isValidDineInSlot, "Fri dine-in");
assertOpen(SAT, "12:00", "21:30", isValidDineInSlot, "Sat dine-in");
assertOpen(SUN, "12:00", "21:30", isValidDineInSlot, "Sun dine-in");

assert.equal(isValidDineInSlot(MON, "17:30"), false);
assert.equal(isValidDineInSlot(MON, "18:00"), false);
assert.equal(isValidDineInSlot(FRI, "22:00"), false);
assert.equal(isValidDineInSlot(WED, "12:00"), false, "normal Wed dine-in closed");
assert.equal(isValidDineInSlot(WED, "15:00"), false);

const wedClosed = resolveDineInSchedule(WED, undefined);
assert.equal(wedClosed.status, "closed");

const wedPh = resolveDineInSchedule(
  WED,
  copyWeeklyDayToDate(OPERATING_HOURS_SEED, WED, 1, [
    "dine_in",
    "hyphen",
    "whitebird",
    "pickup",
  ]),
);
assert.equal(wedPh.status, "open");
if (wedPh.status === "open") {
  assert.equal(wedPh.earliest, "12:00");
  assert.equal(wedPh.latest, "17:00");
  assert.equal(
    wedPh.slots.some((slot) => slot.value === "18:00"),
    false,
    "Wed PH uses configured weekday hours, not 12–21:30",
  );
}

const wedOverrideClosed = resolveDineInSchedule(
  WED,
  closeCapabilitiesOnDate(OPERATING_HOURS_SEED, WED),
);
assert.equal(wedOverrideClosed.status, "closed");

assert.equal(isValidDeliverySlot(MON, "12:00"), true);
assert.equal(isValidDeliverySlot(MON, "15:00"), true);
assert.equal(isValidDeliverySlot(MON, "11:30"), false);
assert.equal(isValidDeliverySlot(MON, "15:30"), false);
assert.equal(isValidDeliverySlot(TUE, "12:00"), true);
assert.equal(isValidDeliverySlot(THU, "15:00"), true);
assert.equal(isValidDeliverySlot(FRI, "12:00"), true);
assert.equal(isValidDeliverySlot(SAT, "15:00"), true);
assert.equal(isValidDeliverySlot(SUN, "12:00"), true);
assert.equal(isValidDeliverySlot(WED, "12:00"), false, "Wed no delivery");
assert.equal(isValidDeliverySlot(WED, "15:00"), false);
assert.equal(getDeliverySchedule(WED).status, "closed");

assert.equal(parseGuestCount("4"), 4);
assert.equal(parseGuestCount("1"), 1);
assert.equal(parseGuestCount("0"), null);
assert.equal(parseGuestCount(""), null);
assert.equal(parseGuestCount("2.5"), null);

console.log("PASS whole-cake fulfilment hours");
