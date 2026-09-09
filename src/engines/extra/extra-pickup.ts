/**
 * Customer Extra pickup slots — operating hours, not order cutoff.
 * Do not truncate at pickup_through_at (order cutoff).
 */

import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  formatPickupClockLabel,
  getEffectivePickupSchedule,
} from "@/engines/business-calendar/pickup-schedule";
import { extraPickupThroughIso } from "@/engines/extra/fresh-picks-time";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";
import type { PickupSlot } from "@/engines/business-calendar/pickup-slots";

export type ExtraPickupWindow = {
  pickupAvailableFromAt: string;
  /** Order cutoff (`pickup_through_at`). Last pickup DATE is this calendar day. */
  orderCutoffAt: string;
};

/** Same-day Fresh Pick only: earliest pickup is now + this lead, then the next 30-minute slot. */
export const EXTRA_SAME_DAY_PICKUP_LEAD_MS = 60 * 60 * 1000;

function extraCustomerSlotFloorMs(dateYmd: string, now: Date): number {
  const nowMs = now.getTime();
  if (dateYmd === toBusinessDateKey(now)) {
    return nowMs + EXTRA_SAME_DAY_PICKUP_LEAD_MS;
  }
  return nowMs;
}

export function extraPickupDates(input: ExtraPickupWindow): string[] {
  const fromYmd = toBusinessDateKey(input.pickupAvailableFromAt);
  const cutoffYmd = toBusinessDateKey(input.orderCutoffAt);
  const dates: string[] = [];
  let cursor: string | null = fromYmd;
  while (cursor && cursor <= cutoffYmd) {
    dates.push(cursor);
    if (cursor === cutoffYmd) break;
    cursor = addBusinessCalendarDays(cursor, 1);
  }
  return dates;
}

/**
 * Fresh Picks dates are window-specific. Two Extras may only share a
 * collection date when their configured windows actually overlap.
 * Callers must not silently merge mismatched windows into one order.
 */
export function extraPickupWindowsShareDate(
  a: ExtraPickupWindow,
  b: ExtraPickupWindow,
): boolean {
  const other = extraPickupDates(b);
  if (other.length === 0) return false;
  const allowed = new Set(other);
  return extraPickupDates(a).some((ymd) => allowed.has(ymd));
}

/** Pickup dates that still have remaining bakery operating-hour slots (Malaysia time). */
export function extraOrderablePickupDates(
  input: ExtraPickupWindow,
  now?: Date,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): string[] {
  const when = now ?? new Date();
  return extraPickupDates(input).filter(
    (ymd) => extraCustomerPickupSlotsForDate(ymd, input, when, snapshot).length > 0,
  );
}

/**
 * Customer-facing Fresh Pick pickup dates.
 * Configured window dates are not all visible from the first day:
 * before the first remaining offering date, only that first date is shown;
 * on that date, the next remaining offering date may also appear.
 * Past dates and dates with no remaining bakery slots stay hidden.
 */
export function extraCustomerVisiblePickupDates(
  input: ExtraPickupWindow,
  now?: Date,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): string[] {
  const when = now ?? new Date();
  const todayYmd = toBusinessDateKey(when);
  const upcoming = extraOrderablePickupDates(input, when, snapshot).filter(
    (ymd) => ymd >= todayYmd,
  );
  if (upcoming.length === 0) return [];
  const first = upcoming[0]!;
  if (first > todayYmd) return [first];
  return upcoming.slice(0, 2);
}

export function extraCustomerPickupSlotsForDate(
  dateYmd: string,
  input: ExtraPickupWindow,
  now?: Date,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): PickupSlot[] {
  if (!extraPickupDates(input).includes(dateYmd)) return [];
  const schedule = getEffectivePickupSchedule(dateYmd, snapshot);
  if (schedule.status !== "open") return [];
  const when = now ?? new Date();
  const fromMs = Date.parse(input.pickupAvailableFromAt);
  const earliestMs = extraCustomerSlotFloorMs(dateYmd, when);
  return schedule.selectableSlots
    .filter((value) => {
      const iso = extraPickupThroughIso(dateYmd, value);
      if (!iso) return false;
      const ms = Date.parse(iso);
      // Pickup is not truncated at the order cutoff.
      // Same-day Fresh Pick: now + 1 hour, rounded up by remaining 30-minute slots.
      // Later dates keep configured bakery slots (past-now slots still hidden).
      return ms >= fromMs && ms >= earliestMs;
    })
    .map((value) => ({
      value,
      label: formatPickupClockLabel(value),
    }));
}

export function isValidExtraCustomerPickup(input: {
  pickupDate: string;
  pickupTime: string;
  pickupAvailableFromAt: string;
  orderCutoffAt: string;
  now?: Date;
}): boolean {
  const window: ExtraPickupWindow = {
    pickupAvailableFromAt: input.pickupAvailableFromAt,
    orderCutoffAt: input.orderCutoffAt,
  };
  if (
    !extraCustomerVisiblePickupDates(window, input.now).includes(input.pickupDate)
  ) {
    return false;
  }
  return extraCustomerPickupSlotsForDate(
    input.pickupDate,
    window,
    input.now,
  ).some((slot) => slot.value === input.pickupTime);
}
