/**
 * Customer pickup slot helpers — thin wrappers over the authoritative
 * effective pickup schedule (`getEffectivePickupSchedule`).
 * Later replaceable by Business Settings / Business Calendar Engine.
 * Values are 24h "HH:MM" (Postgres time-compatible).
 */

import {
  formatPickupClockLabel,
  getEffectivePickupSchedule,
} from "@/engines/business-calendar/pickup-schedule";
import {
  addBusinessCalendarDays,
  toBusinessDateKey,
} from "@/lib/dates";

export type PickupSlot = {
  /** 24-hour time, e.g. "12:00" or "17:30" */
  value: string;
  /** Display label, e.g. "12:00 PM" */
  label: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Returns valid pickup slots for a calendar date (YYYY-MM-DD).
 * Closed operating dates return [].
 */
export function getPickupSlotsForDate(dateYmd: string): PickupSlot[] {
  const schedule = getEffectivePickupSchedule(dateYmd);
  if (schedule.status !== "open") return [];

  return schedule.selectableSlots.map((value) => ({
    value,
    label: formatPickupClockLabel(value),
  }));
}

/** Normalize Postgres "HH:MM:SS" or "HH:MM" to "HH:MM". */
export function normalizePickupTimeValue(time: string): string {
  const parts = time.trim().split(":");
  if (parts.length < 2) return time.trim();
  return `${pad(Number(parts[0]))}:${pad(Number(parts[1]))}`;
}

export function isValidPickupSlot(dateYmd: string, timeValue: string): boolean {
  const normalized = normalizePickupTimeValue(timeValue);
  return getPickupSlotsForDate(dateYmd).some(
    (slot) => slot.value === normalized,
  );
}

/**
 * Owner-only: any valid 24h clock time (HH:MM). Does not require a public
 * customer pickup slot. Used for staff-created / exceptional manual orders.
 */
export function isValidClockPickupTime(timeValue: string): boolean {
  const normalized = normalizePickupTimeValue(timeValue);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized);
}

/** Tomorrow in Asia/Singapore — same earliest date as website checkout HTML min. */
export function earliestPickupDateYmd(from = new Date()): string {
  const todaySg = toBusinessDateKey(from);
  return addBusinessCalendarDays(todaySg, 1) ?? todaySg;
}
