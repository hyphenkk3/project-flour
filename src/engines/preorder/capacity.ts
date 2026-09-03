/**
 * Guest preorder capacity matching — same semantics as
 * `_guest_preorder_item_fully_booked` (Phase 3 submit RPC).
 *
 * No capacity row = unrestricted.
 * Matching row + (used + cart quantity) > capacity = Fully Booked.
 *
 * Used statuses are submit-time occupancy, not the staff confirmed-order floor.
 * Waiting-list holds are not counted. Phase 7 owns waiting lists.
 */

import type { Ymd } from "@/engines/preorder/types";

export const CUSTOMER_DATE_CAPACITY_SEARCH_DAYS = 14;

export const GUEST_PREORDER_CAPACITY_ORDER_STATUSES = [
  "submitted",
  "pending_confirmation",
  "awaiting_payment",
  "paid",
] as const;

export type GuestPreorderCapacityOrderStatus =
  (typeof GUEST_PREORDER_CAPACITY_ORDER_STATUSES)[number];

export type GuestCapacityRow = {
  pickupDate: Ymd;
  cakeId: string;
  sizeId: string | null;
  collectionId: string | null;
  capacityQuantity: number;
  waitingListEnabled: boolean;
};

export type GuestCapacityUsedLine = {
  pickupDate: Ymd;
  cakeId: string;
  sizeId: string | null;
  collectionId: string | null;
  quantity: number;
  status: string;
};

export type GuestCapacityCartLine = {
  cakeId: string;
  cakeSizeId: string;
  cakeName: string;
  quantity: number;
};

export function isGuestPreorderCapacityStatus(
  status: string,
): status is GuestPreorderCapacityOrderStatus {
  return (GUEST_PREORDER_CAPACITY_ORDER_STATUSES as readonly string[]).includes(
    status,
  );
}

export function selectMostSpecificGuestCapacityRow(
  rows: readonly GuestCapacityRow[],
  input: {
    pickupDate: Ymd;
    cakeId: string;
    sizeId: string;
    collectionId: string | null;
  },
): GuestCapacityRow | null {
  const matches = rows.filter(
    (row) =>
      row.pickupDate === input.pickupDate &&
      row.cakeId === input.cakeId &&
      (row.sizeId === null || row.sizeId === input.sizeId) &&
      (row.collectionId === null || row.collectionId === input.collectionId),
  );
  matches.sort((left, right) => {
    const sizeScore =
      Number(right.sizeId !== null) - Number(left.sizeId !== null);
    if (sizeScore !== 0) return sizeScore;
    return (
      Number(right.collectionId !== null) - Number(left.collectionId !== null)
    );
  });
  return matches[0] ?? null;
}

export function usedQuantityForGuestCapacityRow(
  lines: readonly GuestCapacityUsedLine[],
  row: GuestCapacityRow,
): number {
  let total = 0;
  for (const line of lines) {
    if (!isGuestPreorderCapacityStatus(line.status)) continue;
    if (line.pickupDate !== row.pickupDate) continue;
    if (line.cakeId !== row.cakeId) continue;
    if (row.sizeId !== null && line.sizeId !== row.sizeId) continue;
    if (row.collectionId !== null && line.collectionId !== row.collectionId) {
      continue;
    }
    total += line.quantity;
  }
  return total;
}

export function payloadQuantityForCakeSize(
  lines: readonly GuestCapacityCartLine[],
  cakeId: string,
  sizeId: string,
): number {
  let total = 0;
  for (const line of lines) {
    if (line.cakeId !== cakeId || line.cakeSizeId !== sizeId) continue;
    total += line.quantity;
  }
  return total;
}

/**
 * Mirrors `_guest_preorder_item_fully_booked`:
 * no matching row → false; else (used + payloadQty) > capacity.
 */
export function guestPreorderItemFullyBooked(input: {
  pickupDate: Ymd;
  collectionId: string | null;
  cakeId: string;
  sizeId: string;
  quantity: number;
  rows: readonly GuestCapacityRow[];
  used: readonly GuestCapacityUsedLine[];
}): boolean {
  if (input.quantity < 1) return false;
  const row = selectMostSpecificGuestCapacityRow(input.rows, {
    pickupDate: input.pickupDate,
    cakeId: input.cakeId,
    sizeId: input.sizeId,
    collectionId: input.collectionId,
  });
  if (!row) return false;
  const used = usedQuantityForGuestCapacityRow(input.used, row);
  return used + input.quantity > row.capacityQuantity;
}

export type GuestCartDateCapacityView = {
  fullyBooked: boolean;
  waitingListEnabled: boolean;
  blockingCakeNames: string[];
  waitingListLineKeys: string[];
};

export function evaluateGuestCartDateCapacity(input: {
  pickupDate: Ymd;
  collectionId: string | null;
  cart: readonly GuestCapacityCartLine[];
  rows: readonly GuestCapacityRow[];
  used: readonly GuestCapacityUsedLine[];
  collectionWaitingListEnabled?: boolean;
}): GuestCartDateCapacityView {
  const blocking: string[] = [];
  const waitingListLineKeys: string[] = [];
  let waitingListEnabled = false;
  let fullyBooked = false;
  const collectionOn = Boolean(input.collectionWaitingListEnabled);
  for (const line of input.cart) {
    const quantity = payloadQuantityForCakeSize(
      input.cart,
      line.cakeId,
      line.cakeSizeId,
    );
    const row = selectMostSpecificGuestCapacityRow(input.rows, {
      pickupDate: input.pickupDate,
      cakeId: line.cakeId,
      sizeId: line.cakeSizeId,
      collectionId: input.collectionId,
    });
    if (
      !guestPreorderItemFullyBooked({
        pickupDate: input.pickupDate,
        collectionId: input.collectionId,
        cakeId: line.cakeId,
        sizeId: line.cakeSizeId,
        quantity,
        rows: input.rows,
        used: input.used,
      })
    ) {
      continue;
    }
    fullyBooked = true;
    if (collectionOn && row?.waitingListEnabled) {
      waitingListEnabled = true;
      const key = `${line.cakeId}|${line.cakeSizeId}`;
      if (!waitingListLineKeys.includes(key)) waitingListLineKeys.push(key);
    }
    if (line.cakeName && !blocking.includes(line.cakeName)) {
      blocking.push(line.cakeName);
    }
  }
  return {
    fullyBooked,
    waitingListEnabled,
    blockingCakeNames: blocking,
    waitingListLineKeys,
  };
}
