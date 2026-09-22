/**
 * Cake-size effective-date pricing.
 * SQL `library_cake_size_price_on` is authoritative at order create.
 * This helper mirrors that rule for tests and staff overlap checks.
 */

import { formatBusinessCalendarDate } from "@/lib/dates";

export type CakeSizePriceSchedule = {
  id?: string;
  cakeSizeId: string;
  price: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function coversPickupDate(
  schedule: Pick<CakeSizePriceSchedule, "effectiveFrom" | "effectiveTo">,
  pickupDate: string,
): boolean {
  if (schedule.effectiveFrom > pickupDate) return false;
  if (schedule.effectiveTo == null) return true;
  return schedule.effectiveTo >= pickupDate;
}

export function cakeSizePriceScheduleRangesOverlap(
  left: Pick<CakeSizePriceSchedule, "effectiveFrom" | "effectiveTo">,
  right: Pick<CakeSizePriceSchedule, "effectiveFrom" | "effectiveTo">,
): boolean {
  const leftEnd = left.effectiveTo ?? "9999-12-31";
  const rightEnd = right.effectiveTo ?? "9999-12-31";
  return left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd;
}

export function resolveCakeSizePriceOn(input: {
  basePrice: number;
  schedules: Array<
    Pick<CakeSizePriceSchedule, "price" | "effectiveFrom" | "effectiveTo">
  >;
  pickupDate: string;
}): number {
  if (!isYmd(input.pickupDate)) {
    throw new Error("Pickup date is required");
  }
  const covering = input.schedules.filter((row) =>
    coversPickupDate(row, input.pickupDate),
  );
  if (covering.length > 1) {
    throw new Error(
      `Multiple scheduled prices cover ${input.pickupDate} for this cake size`,
    );
  }
  if (covering.length === 1) {
    return covering[0]!.price;
  }
  return input.basePrice;
}

export function formatCakeSizePriceSchedulePeriod(input: {
  effectiveFrom: string;
  effectiveTo: string | null;
}): string {
  const fromLabel = formatBusinessCalendarDate(input.effectiveFrom);
  if (!input.effectiveTo) {
    return `${fromLabel} onward`;
  }
  if (input.effectiveTo === input.effectiveFrom) {
    return fromLabel;
  }
  return `${fromLabel} – ${formatBusinessCalendarDate(input.effectiveTo)}`;
}
