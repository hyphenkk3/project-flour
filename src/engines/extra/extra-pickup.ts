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
import {
  DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  DEFAULT_FRESH_PICKS_SAME_DAY_LEAD_MINUTES,
  isFreshPicksFulfilmentDateToday,
  isFreshPicksSameDayCutoffPassed,
  slotPassesFreshPicksLead,
  type FreshPicksPreparationConfig,
} from "@/engines/extra/fresh-picks-preparation";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";
import type { PickupSlot } from "@/engines/business-calendar/pickup-slots";

export type ExtraPickupWindow = {
  pickupAvailableFromAt: string;
  /** Order cutoff (`pickup_through_at`). Last pickup DATE is this calendar day. */
  orderCutoffAt: string;
};

/** Default same-day pickup lead. Prefer FreshPicksPreparationConfig.leadMinutes. */
export const EXTRA_SAME_DAY_PICKUP_LEAD_MS =
  DEFAULT_FRESH_PICKS_SAME_DAY_LEAD_MINUTES * 60 * 1000;

export type ExtraPickupSlotOptions = {
  /** When false, skip cutoff + lead so callers can explain why a method is gone. */
  applySameDayPreparation?: boolean;
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

function extraOperatingPickupSlotsForDate(
  dateYmd: string,
  input: ExtraPickupWindow,
  snapshot: OperatingHoursSnapshot,
): PickupSlot[] {
  if (!extraPickupDates(input).includes(dateYmd)) return [];
  const schedule = getEffectivePickupSchedule(dateYmd, snapshot);
  if (schedule.status !== "open") return [];
  const fromMs = Date.parse(input.pickupAvailableFromAt);
  if (!Number.isFinite(fromMs)) return [];
  return schedule.selectableSlots
    .filter((value) => {
      const iso = extraPickupThroughIso(dateYmd, value);
      if (!iso) return false;
      return Date.parse(iso) >= fromMs;
    })
    .map((value) => ({
      value,
      label: formatPickupClockLabel(value),
    }));
}

/** Pickup dates that still have remaining bakery operating-hour slots (Malaysia time). */
export function extraOrderablePickupDates(
  input: ExtraPickupWindow,
  now?: Date,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
  config: FreshPicksPreparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
): string[] {
  const when = now ?? new Date();
  return extraPickupDates(input).filter(
    (ymd) =>
      extraCustomerPickupSlotsForDate(ymd, input, when, snapshot, config)
        .length > 0,
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
  config: FreshPicksPreparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
): string[] {
  const when = now ?? new Date();
  const todayYmd = toBusinessDateKey(when);
  const upcoming = extraOrderablePickupDates(input, when, snapshot, config).filter(
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
  config: FreshPicksPreparationConfig = DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  options: ExtraPickupSlotOptions = {},
): PickupSlot[] {
  const applySameDayPreparation = options.applySameDayPreparation !== false;
  const slots = extraOperatingPickupSlotsForDate(dateYmd, input, snapshot);
  if (!applySameDayPreparation) return slots;
  const when = now ?? new Date();
  if (
    isFreshPicksFulfilmentDateToday(dateYmd, when) &&
    isFreshPicksSameDayCutoffPassed(when, config)
  ) {
    return [];
  }
  return slots.filter((slot) =>
    slotPassesFreshPicksLead({
      dateYmd,
      timeHm: slot.value,
      now: when,
      config,
      comparison: "inclusive",
    }),
  );
}

export function isValidExtraCustomerPickup(input: {
  pickupDate: string;
  pickupTime: string;
  pickupAvailableFromAt: string;
  orderCutoffAt: string;
  now?: Date;
  snapshot?: OperatingHoursSnapshot;
  config?: FreshPicksPreparationConfig;
}): boolean {
  const window: ExtraPickupWindow = {
    pickupAvailableFromAt: input.pickupAvailableFromAt,
    orderCutoffAt: input.orderCutoffAt,
  };
  const snapshot = input.snapshot ?? OPERATING_HOURS_SEED;
  const config = input.config ?? DEFAULT_FRESH_PICKS_PREPARATION_CONFIG;
  if (
    !extraCustomerVisiblePickupDates(
      window,
      input.now,
      snapshot,
      config,
    ).includes(input.pickupDate)
  ) {
    return false;
  }
  return extraCustomerPickupSlotsForDate(
    input.pickupDate,
    window,
    input.now,
    snapshot,
    config,
  ).some((slot) => slot.value === input.pickupTime);
}
