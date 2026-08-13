/**
 * Effective pickup schedule foundation (M5-P2 refinement).
 * Run: npx tsx scripts/test-pickup-schedule-foundation.ts
 */
import assert from "node:assert/strict";
import {
  isEarlyPickupAttention,
  isEarlyPickupForSchedule,
} from "@/engines/business-calendar/early-pickup";
import type { PickupDateOverride } from "@/engines/business-calendar/pickup-date-overrides";
import {
  STAFF_CLOSED_DATE_WARNING,
  formatPickupClockLabel,
  getStaffPickupExceptionWarning,
  rangeSlotsInclusive,
  resolveEffectivePickupSchedule,
  staffOutsidePublicHoursWarning,
} from "@/engines/business-calendar/pickup-schedule";
import {
  getPickupSlotsForDate,
  isValidPickupSlot,
} from "@/engines/business-calendar/pickup-slots";
import {
  bakeryAttentionBadgeLabel,
  hasEffectiveBakeryAttention,
} from "@/workspaces/bakery/eligibility";

function ymdForWeekday(weekday: number): string {
  // 2026-08-09 is Sunday.
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

assert.equal(new Date(2026, 7, 10).getDay(), 1, "MON fixture");
assert.equal(new Date(2026, 7, 12).getDay(), 3, "WED fixture");
assert.equal(new Date(2026, 7, 14).getDay(), 5, "FRI fixture");
assert.equal(new Date(2026, 7, 9).getDay(), 0, "SUN fixture");

function slotValues(date: string): string[] {
  return getPickupSlotsForDate(date).map((s) => s.value);
}

function assertRange(date: string, start: string, end: string, label: string) {
  const expected = rangeSlotsInclusive(start, end);
  assert.deepEqual(slotValues(date), expected, label);
  assert.equal(isValidPickupSlot(date, start), true, `${label} start`);
  assert.equal(isValidPickupSlot(date, end), true, `${label} end exact`);
}

// --- Normal weekly behaviour (empty override map) ---
assertRange(MON, "12:00", "17:30", "Mon slots");
assertRange(TUE, "12:00", "17:30", "Tue slots");
assertRange(THU, "12:00", "17:30", "Thu slots");
assertRange(WED, "12:00", "15:00", "Wed slots");
assertRange(FRI, "12:00", "21:30", "Fri late");
assertRange(SAT, "12:00", "21:30", "Sat late");
assertRange(SUN, "12:00", "21:30", "Sun late");

assert.equal(isValidPickupSlot(FRI, "21:30"), true);
assert.equal(isValidPickupSlot(FRI, "22:00"), false);
assert.equal(isValidPickupSlot(WED, "15:30"), false);
assert.equal(isValidPickupSlot(MON, "18:00"), false);

const monOpen = resolveEffectivePickupSchedule(MON, undefined);
assert.equal(monOpen.status, "open");
if (monOpen.status === "open") {
  assert.equal(monOpen.baseProfile, "weekday");
  assert.equal(monOpen.usualPickupStart, "15:00");
  assert.equal(monOpen.usualPickupEnd, "17:30");
  assert.equal(monOpen.latestSelectable, "17:30");
}

const wedOpen = resolveEffectivePickupSchedule(WED, undefined);
assert.equal(wedOpen.status, "open");
if (wedOpen.status === "open") {
  assert.equal(wedOpen.baseProfile, "wednesday_walkin_closed");
  assert.equal(wedOpen.usualPickupStart, "13:00");
  assert.equal(wedOpen.latestSelectable, "15:00");
}

const friOpen = resolveEffectivePickupSchedule(FRI, undefined);
assert.equal(friOpen.status, "open");
if (friOpen.status === "open") {
  assert.equal(friOpen.baseProfile, "weekend_extended");
  assert.equal(friOpen.usualPickupStart, "15:00");
  assert.equal(friOpen.latestSelectable, "21:30");
}

// Contiguous Fri equivalence vs prior split arrays
assert.deepEqual(
  rangeSlotsInclusive("12:00", "21:30"),
  [
    ...rangeSlotsInclusive("12:00", "17:30"),
    ...rangeSlotsInclusive("18:00", "21:30"),
  ],
  "Fri contiguous == prior split ranges",
);

// --- Early Pickup on normal weekly ---
const earlyCases: Array<[string, string, boolean]> = [
  [MON, "14:30", true],
  [MON, "15:00", false],
  [WED, "12:30", true],
  [WED, "13:00", false],
  [FRI, "14:30", true],
  [FRI, "15:00", false],
  [FRI, "21:30", false],
];
for (const [date, time, expected] of earlyCases) {
  assert.equal(
    isEarlyPickupAttention(date, time),
    expected,
    `early ${date} ${time}`,
  );
}

// --- Wednesday special-open ---
const wedSpecial: PickupDateOverride = {
  mode: "special",
  baseProfile: "weekday",
};
const wedPh = resolveEffectivePickupSchedule(WED, wedSpecial);
assert.equal(wedPh.status, "open");
if (wedPh.status === "open") {
  assert.equal(wedPh.baseProfile, "weekday");
  assert.equal(wedPh.usualPickupStart, "15:00");
  assert.equal(wedPh.usualPickupEnd, "17:30");
  assert.equal(wedPh.latestSelectable, "17:30");
  assert.deepEqual(
    wedPh.selectableSlots,
    rangeSlotsInclusive("12:00", "17:30"),
  );
  assert.equal(wedPh.selectableSlots.includes("18:00"), false);
  assert.equal(isEarlyPickupForSchedule(wedPh, "12:30"), true);
  assert.equal(isEarlyPickupForSchedule(wedPh, "14:30"), true);
  assert.equal(isEarlyPickupForSchedule(wedPh, "15:00"), false);
}

// --- CLOSED date ---
const closed = resolveEffectivePickupSchedule(MON, { mode: "closed" });
assert.equal(closed.status, "closed");
assert.equal(isEarlyPickupForSchedule(closed, "12:00"), false);
assert.equal(isEarlyPickupForSchedule(closed, "15:00"), false);

const closedWarn = getStaffPickupExceptionWarning(MON, "15:00", closed);
assert.ok(closedWarn);
assert.equal(closedWarn?.kind, "closed_date");
assert.equal(closedWarn?.message, STAFF_CLOSED_DATE_WARNING);

// Production map empty → Monday still open for public APIs
assert.ok(getPickupSlotsForDate(MON).length > 0);
assert.equal(isValidPickupSlot(MON, "15:00"), true);

// --- Special latest 16:00 on Friday ---
const friLatest16 = resolveEffectivePickupSchedule(FRI, {
  mode: "special",
  latestSelectable: "16:00",
});
assert.equal(friLatest16.status, "open");
if (friLatest16.status === "open") {
  assert.equal(friLatest16.usualPickupStart, "15:00");
  assert.equal(friLatest16.latestSelectable, "16:00");
  assert.deepEqual(
    friLatest16.selectableSlots,
    rangeSlotsInclusive("12:00", "16:00"),
  );
  assert.ok(friLatest16.selectableSlots.includes("16:00"));
  assert.equal(friLatest16.selectableSlots.includes("16:30"), false);
  assert.equal(friLatest16.selectableSlots.includes("21:30"), false);
  assert.equal(isEarlyPickupForSchedule(friLatest16, "14:30"), true);
  assert.equal(isEarlyPickupForSchedule(friLatest16, "15:00"), false);
  assert.equal(isEarlyPickupForSchedule(friLatest16, "16:00"), false);
}

// --- Special latest 15:00 ---
const friLatest15 = resolveEffectivePickupSchedule(FRI, {
  mode: "special",
  latestSelectable: "15:00",
});
assert.equal(friLatest15.status, "open");
if (friLatest15.status === "open") {
  assert.ok(friLatest15.selectableSlots.includes("15:00"));
  assert.equal(friLatest15.selectableSlots.includes("15:30"), false);
  assert.equal(isEarlyPickupForSchedule(friLatest15, "14:30"), true);
  assert.equal(isEarlyPickupForSchedule(friLatest15, "15:00"), false);
}

// --- Staff outside-hours warning ---
assert.equal(
  getStaffPickupExceptionWarning(FRI, "15:00", friOpen),
  null,
  "public slot → no warning",
);
const outside = getStaffPickupExceptionWarning(FRI, "22:00", friOpen);
assert.ok(outside);
assert.equal(outside?.kind, "outside_public_hours");
assert.equal(
  outside?.message,
  staffOutsidePublicHoursWarning("21:30"),
);
assert.ok(outside?.message.includes(formatPickupClockLabel("21:30")));

const shortOutside = getStaffPickupExceptionWarning(
  FRI,
  "16:30",
  friLatest16,
);
assert.ok(shortOutside);
assert.equal(shortOutside?.kind, "outside_public_hours");
assert.ok(shortOutside?.message.includes("4:00 PM"));

// Closed date warning even before time chosen
assert.equal(
  getStaffPickupExceptionWarning(MON, null, closed)?.kind,
  "closed_date",
);

// --- Manual Bakery Attention coexistence (production weekly) ---
assert.equal(
  hasEffectiveBakeryAttention({
    needsBakeryAttention: true,
    pickupDate: MON,
    pickupTime: "15:00",
  }),
  true,
);
assert.equal(
  bakeryAttentionBadgeLabel({
    needsBakeryAttention: true,
    pickupDate: MON,
    pickupTime: "15:00",
  }),
  "Bakery Attention",
);
assert.equal(
  bakeryAttentionBadgeLabel({
    needsBakeryAttention: false,
    pickupDate: MON,
    pickupTime: "12:30",
  }),
  "Bakery Attention · Early pickup",
);

// Simulate customer validation against resolved special schedules via
// slot membership (same rule isValidPickupSlot uses on production map).
function customerWouldAccept(
  schedule: ReturnType<typeof resolveEffectivePickupSchedule>,
  time: string,
): boolean {
  return schedule.status === "open" && schedule.selectableSlots.includes(time);
}

assert.equal(customerWouldAccept(closed, "15:00"), false);
assert.equal(customerWouldAccept(friLatest16, "16:00"), true);
assert.equal(customerWouldAccept(friLatest16, "16:30"), false);
assert.equal(customerWouldAccept(friLatest15, "15:00"), true);
assert.equal(customerWouldAccept(friLatest15, "15:30"), false);
assert.equal(customerWouldAccept(wedPh, "17:30"), true);
assert.equal(customerWouldAccept(wedPh, "18:00"), false);

console.log("PASS pickup schedule foundation");
