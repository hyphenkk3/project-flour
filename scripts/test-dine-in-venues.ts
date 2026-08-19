/**
 * Whole Cake dine-in venue availability (Hyphen / Whitebird).
 * Run: npx tsx scripts/test-dine-in-venues.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { copyWeeklyDayToDate } from "@/engines/business-calendar/operating-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  availableDineInVenues,
  isDineInVenueAvailable,
  isValidDineInSlot,
  resolveDineInSchedule,
} from "@/engines/business-calendar/dine-in-hours";

function ymdForWeekday(weekday: number): string {
  const day = 9 + weekday;
  return `2026-08-${String(day).padStart(2, "0")}`;
}

const MON = ymdForWeekday(1);
const TUE = ymdForWeekday(2);
const WED = ymdForWeekday(3);
const THU = ymdForWeekday(4);
const FRI = ymdForWeekday(5);

function both(date: string, time: string) {
  assert.deepEqual(availableDineInVenues(date, time), ["hyphen", "whitebird"]);
  assert.equal(isValidDineInSlot(date, time), true);
}

function whitebirdOnly(date: string, time: string) {
  assert.deepEqual(availableDineInVenues(date, time), ["whitebird"]);
  assert.equal(isDineInVenueAvailable(date, time, "hyphen"), false);
  assert.equal(isDineInVenueAvailable(date, time, "whitebird"), true);
  assert.equal(isValidDineInSlot(date, time), true);
}

function none(date: string, time: string) {
  assert.deepEqual(availableDineInVenues(date, time), []);
  assert.equal(isValidDineInSlot(date, time), false);
}

both(MON, "17:00");
both(TUE, "17:00");
both(THU, "17:00");
both(FRI, "17:00");
none(MON, "17:30");
none(TUE, "17:30");
none(THU, "17:30");
whitebirdOnly(FRI, "17:30");
whitebirdOnly(FRI, "18:00");
whitebirdOnly(FRI, "21:30");
none(FRI, "22:00");
none(WED, "12:00");
none(WED, "17:00");

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
    wedPh.slots.some((slot) => slot.value === "17:30"),
    false,
    "special-open Wednesday uses weekday venue last-bookable, not 17:30 close",
  );
}

const venueMigration = readFileSync(
  resolve("supabase/migrations/20260819100000_dine_in_reservation_venue.sql"),
  "utf8",
);
assert.match(venueMigration, /create type public.dine_in_venue/);
assert.match(venueMigration, /'hyphen'/);
assert.match(venueMigration, /'whitebird'/);
assert.match(venueMigration, /is_valid_dine_in_venue/);
assert.match(venueMigration, /v_dow = 3 then/);
assert.match(venueMigration, /PICKUP_DATE_OVERRIDES/);
assert.doesNotMatch(venueMigration, /submit_guest_extra_order\s*\(/);

console.log("PASS dine-in venues");
