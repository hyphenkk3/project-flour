/**
 * Fresh Pick Walk-in Hold → Sold.
 * Hold is the reservation. This helper only derives the collection date
 * for the resulting walk_in Extra order — same rule as extra_walk_in_sale_pickup_date.
 */

import { toBusinessDateKey } from "@/lib/dates";

export const WALK_IN_SALE_GUEST_NAME = "WALK-IN";

export const WALK_IN_SALE_REQUIRES_HOLD_ERROR =
  "Sold is only available from an active Walk-in Hold.";

export function extraWalkInSalePickupDate(input: {
  preparedOn: string | null;
  pickupAvailableFromAt: string | null;
  pickupThroughAt: string | null;
  now?: Date;
}): string {
  const today = toBusinessDateKey(input.now ?? new Date());
  const from = input.pickupAvailableFromAt
    ? toBusinessDateKey(input.pickupAvailableFromAt)
    : "";
  const through = input.pickupThroughAt
    ? toBusinessDateKey(input.pickupThroughAt)
    : "";
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(through) &&
    today >= from &&
    today <= through
  ) {
    return today;
  }
  const prepared = input.preparedOn?.trim().slice(0, 10) ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(prepared)) return prepared;
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) return from;
  return today;
}
