/**
 * Fresh Picks Extra — three separate concepts (do not merge):
 *
 * 1. LIVE / POSTED — `confirmed_at`. Customer can see and order immediately.
 * 2. PICKUP AVAILABLE FROM — `pickup_available_from_at`. Earliest pickup slot.
 * 3. ORDER AVAILABLE THROUGH — `pickup_through_at` (column name kept).
 *    Latest time a NEW order may be placed. Not the last pickup time.
 *
 * Independent of monthly catalogues.
 */

import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  formatPickupClockLabel,
  getEffectivePickupSchedule,
} from "@/engines/business-calendar/pickup-schedule";
import {
  addBusinessCalendarDays,
  calendarDaysBetween,
  formatBusinessCalendarDate,
  toBusinessDateKey,
} from "@/lib/dates";
import {
  extraPickupThroughIso,
  formatExtraBoardWindowInstant,
  formatExtraPickupThroughClock,
  singaporeDateTimeToIso,
} from "@/engines/extra/fresh-picks-time";
import { freshPickDay, type FreshPickDay } from "@/engines/extra/customer-fresh-picks";

export type { FreshPickDay };
export {
  extraPickupThroughIso,
  formatExtraBoardWindowInstant,
  formatExtraPickupThroughClock,
  singaporeDateTimeToIso,
};
export { isExtraThroughSlot } from "@/engines/extra/fresh-picks-time";

export const EXTRA_THROUGH_SLOT_INTERVAL_MINUTES = 30;

export const EXTRA_FRESH_PICKS_TODAY_OR_TOMORROW =
  "Fresh Picks pickup and order-cutoff dates must be today or tomorrow.";

export const EXTRA_CUTOFF_BEYOND_PICKUP_PLUS_ONE =
  "Order cutoff must be on the pickup-from date or the next calendar day.";

export const EXTRA_THROUGH_SLOT_REQUIRED =
  "Choose when orders are available through.";

export const EXTRA_PICKUP_FROM_REQUIRED =
  "Choose when pickup is available from.";

export const EXTRA_THROUGH_SLOT_INTERVAL =
  "Order cutoff must be a 30-minute interval.";

export const EXTRA_THROUGH_TIME_PAST =
  "That order cutoff has already passed. Choose a later time.";

export const EXTRA_PICKUP_FROM_NOT_OPERATING =
  "Pickup available from must be a valid bakery pickup time for that date.";

export const EXTRA_CUTOFF_NOT_OPERATING =
  "Orders available through must be a valid 30-minute time on that date.";

export const EXTRA_FROM_AFTER_CUTOFF =
  "Pickup available from must not be after the order cutoff.";

export const EXTRA_NO_TODAY_SLOTS_LEFT =
  "No remaining order-cutoff times today. Choose tomorrow, or wait until a later Fresh Picks window.";

export function extraAvailabilityDayLabel(day: FreshPickDay): string {
  return day === "today" ? "Today" : "Tomorrow";
}

export type ExtraThroughSlot = {
  value: string;
  label: string;
};

export function extraThroughSlotLabel(hhmm: string): string {
  return formatPickupClockLabel(hhmm);
}

/** Operating-hour 30-minute slots for a Singapore business date. */
export function extraOperatingSlotsForDate(
  ymd: string,
  snapshot?: OperatingHoursSnapshot,
): ExtraThroughSlot[] {
  const schedule = getEffectivePickupSchedule(ymd, snapshot);
  if (schedule.status !== "open") return [];
  return schedule.selectableSlots.map((value) => ({
    value,
    label: extraThroughSlotLabel(value),
  }));
}

export function isExtraOperatingPickupSlot(
  ymd: string,
  hhmm: string,
): boolean {
  return extraOperatingSlotsForDate(ymd).some((slot) => slot.value === hhmm);
}

export function extraFreshPickDay(
  preparedOn: string | null | undefined,
  todayYmd: string,
): FreshPickDay | null {
  return freshPickDay(preparedOn ?? null, todayYmd);
}

export function extraFreshPickDates(todayYmd: string): {
  today: string;
  tomorrow: string | null;
} {
  return {
    today: todayYmd.trim().slice(0, 10),
    tomorrow: addBusinessCalendarDays(todayYmd, 1),
  };
}

export function isExtraHorizonDate(
  ymd: string | null | undefined,
  todayYmd: string,
): boolean {
  return extraFreshPickDay(ymd ?? null, todayYmd) != null;
}

export function extraOrderCutoffDatesForPickupFrom(
  pickupFromDate: string,
): string[] {
  const from = pickupFromDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return [];
  const next = addBusinessCalendarDays(from, 1);
  return next ? [from, next] : [from];
}

export function isExtraOrderCutoffDateAllowed(
  pickupFromDate: string,
  cutoffDate: string,
): boolean {
  const delta = calendarDaysBetween(
    pickupFromDate.trim().slice(0, 10),
    cutoffDate.trim().slice(0, 10),
  );
  return delta != null && delta >= 0 && delta <= 1;
}

export function clampExtraOrderCutoffDate(
  pickupFromDate: string,
  cutoffDate: string,
): string {
  const allowed = extraOrderCutoffDatesForPickupFrom(pickupFromDate);
  if (allowed.length === 0) return cutoffDate.trim().slice(0, 10);
  const candidate = cutoffDate.trim().slice(0, 10);
  if (allowed.includes(candidate)) return candidate;
  if (candidate < allowed[0]!) return allowed[0]!;
  return allowed[allowed.length - 1]!;
}

export function extraConfirmDateLabel(ymd: string, todayYmd: string): string {
  const day = extraFreshPickDay(ymd, todayYmd);
  if (day) return extraAvailabilityDayLabel(day);
  return formatBusinessCalendarDate(ymd);
}

export function extraOrderCutoffDateOptions(
  pickupFromDate: string,
  todayYmd: string,
): Array<{ value: string; label: string }> {
  return extraOrderCutoffDatesForPickupFrom(pickupFromDate).map((value) => ({
    value,
    label: extraConfirmDateLabel(value, todayYmd),
  }));
}

export function extraOrderCutoffSlotsForDate(input: {
  cutoffDate: string;
  todayYmd: string;
  now?: Date;
}): Array<ExtraThroughSlot & { disabled: boolean }> {
  const now = input.now ?? new Date();
  const cutoff = input.cutoffDate.trim().slice(0, 10);
  const today = input.todayYmd.trim().slice(0, 10);
  return extraOperatingSlotsForDate(cutoff).map((slot) => {
    if (cutoff < today) return { ...slot, disabled: true };
    if (cutoff > today) return { ...slot, disabled: false };
    const iso = extraPickupThroughIso(cutoff, slot.value);
    return { ...slot, disabled: !iso || Date.parse(iso) <= now.getTime() };
  });
}

export function extraPickupFromSlotsForDate(input: {
  pickupFromDate: string;
  todayYmd: string;
}): Array<ExtraThroughSlot & { disabled: boolean }> {
  const day = extraFreshPickDay(input.pickupFromDate, input.todayYmd);
  return extraOperatingSlotsForDate(input.pickupFromDate).map((slot) => ({
    ...slot,
    disabled: day == null,
  }));
}

export function defaultExtraPickupFromSlot(input: {
  pickupFromDate: string;
  todayYmd: string;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  const day = extraFreshPickDay(input.pickupFromDate, input.todayYmd);
  const slots = extraOperatingSlotsForDate(input.pickupFromDate);
  if (day === "tomorrow") return slots[0]?.value ?? null;
  if (day !== "today") return null;
  for (const slot of slots) {
    const iso = extraPickupThroughIso(input.pickupFromDate, slot.value);
    if (iso && Date.parse(iso) > now.getTime()) return slot.value;
  }
  return slots[0]?.value ?? null;
}

export function defaultExtraOrderCutoffSlot(input: {
  cutoffDate: string;
  todayYmd: string;
  now?: Date;
  notBeforeIso?: string;
}): string | null {
  const now = input.now ?? new Date();
  const minMs = Math.max(
    now.getTime(),
    input.notBeforeIso ? Date.parse(input.notBeforeIso) : 0,
  );
  const remaining: string[] = [];
  for (const slot of extraOperatingSlotsForDate(input.cutoffDate)) {
    const iso = extraPickupThroughIso(input.cutoffDate, slot.value);
    if (iso && Date.parse(iso) > minMs) remaining.push(slot.value);
  }
  return remaining[remaining.length - 1] ?? null;
}

/** @deprecated Use defaultExtraOrderCutoffSlot — kept for live activation fixtures. */
export function defaultExtraThroughSlot(input: {
  preparedOn: string;
  todayYmd: string;
  now?: Date;
}): string | null {
  return defaultExtraOrderCutoffSlot({
    cutoffDate: input.preparedOn,
    todayYmd: input.todayYmd,
    now: input.now,
  });
}

export type ExtraConfirmDecision =
  | {
      ok: true;
      pickupFromDate: string;
      pickupFromSlot: string;
      pickupAvailableFromIso: string;
      cutoffDate: string;
      cutoffSlot: string;
      orderCutoffIso: string;
      preparedOn: string;
    }
  | { ok: false; error: string };

export function evaluateExtraConfirm(input: {
  pickupFromDate: string | null | undefined;
  pickupFromSlot: string | null | undefined;
  cutoffDate: string | null | undefined;
  cutoffSlot: string | null | undefined;
  todayYmd: string;
  now?: Date;
}): ExtraConfirmDecision {
  const pickupFromDate = input.pickupFromDate?.trim().slice(0, 10) ?? "";
  const cutoffDate = input.cutoffDate?.trim().slice(0, 10) ?? "";
  const pickupFromSlot = input.pickupFromSlot?.trim() ?? "";
  const cutoffSlot = input.cutoffSlot?.trim() ?? "";

  if (!isExtraHorizonDate(pickupFromDate, input.todayYmd)) {
    return { ok: false, error: EXTRA_FRESH_PICKS_TODAY_OR_TOMORROW };
  }
  if (!isExtraOrderCutoffDateAllowed(pickupFromDate, cutoffDate)) {
    const delta = calendarDaysBetween(pickupFromDate, cutoffDate);
    if (delta != null && delta < 0) {
      return { ok: false, error: EXTRA_FROM_AFTER_CUTOFF };
    }
    return { ok: false, error: EXTRA_CUTOFF_BEYOND_PICKUP_PLUS_ONE };
  }
  if (!pickupFromSlot) {
    return { ok: false, error: EXTRA_PICKUP_FROM_REQUIRED };
  }
  if (!cutoffSlot) {
    return { ok: false, error: EXTRA_THROUGH_SLOT_REQUIRED };
  }
  if (!isExtraOperatingPickupSlot(pickupFromDate, pickupFromSlot)) {
    return { ok: false, error: EXTRA_PICKUP_FROM_NOT_OPERATING };
  }
  if (!isExtraOperatingPickupSlot(cutoffDate, cutoffSlot)) {
    return { ok: false, error: EXTRA_CUTOFF_NOT_OPERATING };
  }
  const pickupAvailableFromIso = extraPickupThroughIso(
    pickupFromDate,
    pickupFromSlot,
  );
  const orderCutoffIso = extraPickupThroughIso(cutoffDate, cutoffSlot);
  if (!pickupAvailableFromIso || !orderCutoffIso) {
    return { ok: false, error: EXTRA_THROUGH_SLOT_INTERVAL };
  }
  if (Date.parse(pickupAvailableFromIso) > Date.parse(orderCutoffIso)) {
    return { ok: false, error: EXTRA_FROM_AFTER_CUTOFF };
  }
  const now = input.now ?? new Date();
  if (Date.parse(orderCutoffIso) <= now.getTime()) {
    return { ok: false, error: EXTRA_THROUGH_TIME_PAST };
  }
  return {
    ok: true,
    pickupFromDate,
    pickupFromSlot,
    pickupAvailableFromIso,
    cutoffDate,
    cutoffSlot,
    orderCutoffIso,
    preparedOn: pickupFromDate,
  };
}

export function extraCustomerAvailabilityLabel(input: {
  pickupAvailableFromAt: string | null;
  todayYmd: string;
}): string {
  const fromYmd = input.pickupAvailableFromAt
    ? toBusinessDateKey(input.pickupAvailableFromAt)
    : "";
  const day = extraFreshPickDay(fromYmd, input.todayYmd);
  if (day === "tomorrow") return "Available tomorrow";
  return "Available today";
}
