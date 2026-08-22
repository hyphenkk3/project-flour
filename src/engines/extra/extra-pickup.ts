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

export function extraCustomerPickupSlotsForDate(
  dateYmd: string,
  input: ExtraPickupWindow,
  now?: Date,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): PickupSlot[] {
  if (!extraPickupDates(input).includes(dateYmd)) return [];
  const schedule = getEffectivePickupSchedule(dateYmd, snapshot);
  if (schedule.status !== "open") return [];
  const fromMs = Date.parse(input.pickupAvailableFromAt);
  const nowMs = (now ?? new Date()).getTime();
  return schedule.selectableSlots
    .filter((value) => {
      const iso = extraPickupThroughIso(dateYmd, value);
      if (!iso) return false;
      const ms = Date.parse(iso);
      // Pickup is not truncated at the order cutoff. Past-now slots are hidden.
      return ms >= fromMs && ms >= nowMs;
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
  return extraCustomerPickupSlotsForDate(
    input.pickupDate,
    {
      pickupAvailableFromAt: input.pickupAvailableFromAt,
      orderCutoffAt: input.orderCutoffAt,
    },
    input.now,
  ).some((slot) => slot.value === input.pickupTime);
}
