/**
 * Customer order-availability overlay.
 *
 * Separate from:
 * - catalogues (which cakes are offered)
 * - website override (which catalogue the website shows)
 * - PICKUP_DATE_OVERRIDES (code-config operating hours; currently empty)
 *
 * Explicit closed pickup dates are stored in order_availability_overrides.
 * The weekly pickup schedule remains the default.
 */

import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import { getEffectivePickupSchedule } from "@/engines/business-calendar/pickup-schedule";
import {
  getPickupSlotsForDate,
  type PickupSlot,
} from "@/engines/business-calendar/pickup-slots";
import {
  businessYearMonth,
  parseBusinessDate,
} from "@/lib/dates";

export const ORDERS_CLOSED_CUSTOMER_LABEL = "Orders closed";
export const ORDERS_CLOSED_RPC_MESSAGE =
  "Orders are closed for that pickup date.";

const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

export function closedPickupDateSet(
  dates: readonly string[],
): ReadonlySet<string> {
  return new Set(
    dates.filter((value) => parseBusinessDate(value) != null),
  );
}

export function isPickupOrdersClosed(
  dateYmd: string,
  closedDates: readonly string[],
): boolean {
  return closedPickupDateSet(closedDates).has(dateYmd);
}

export function customerPickupSlotsForDate(
  dateYmd: string,
  closedDates: readonly string[],
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): PickupSlot[] {
  if (isPickupOrdersClosed(dateYmd, closedDates)) return [];
  return getPickupSlotsForDate(dateYmd, snapshot);
}

export function customerMaySelectPickupDate(
  dateYmd: string,
  closedDates: readonly string[],
  earliestYmd?: string,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): boolean {
  if (earliestYmd && dateYmd < earliestYmd) return false;
  if (isPickupOrdersClosed(dateYmd, closedDates)) return false;
  return getEffectivePickupSchedule(dateYmd, snapshot).status === "open";
}

export function parseOrderAvailabilityMonth(
  raw: string | null | undefined,
  fallbackYmd: string,
): string {
  const match = YEAR_MONTH.exec((raw ?? "").trim());
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) {
      return `${match[1]}-${match[2]}`;
    }
  }
  return businessYearMonth(fallbackYmd) ?? fallbackYmd.slice(0, 7);
}

export function shiftOrderAvailabilityMonth(
  yearMonth: string,
  delta: number,
): string {
  const parsed = YEAR_MONTH.exec(yearMonth);
  if (!parsed) return yearMonth;
  const date = new Date(Number(parsed[1]), Number(parsed[2]) - 1 + delta, 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function orderAvailabilityMonthDays(yearMonth: string): string[] {
  const parsed = YEAR_MONTH.exec(yearMonth);
  if (!parsed) return [];
  const year = Number(parsed[1]);
  const month = Number(parsed[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const days: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    days.push(
      `${parsed[1]}-${parsed[2]}-${String(day).padStart(2, "0")}`,
    );
  }
  return days;
}
