/**
 * Waiting-list eligibility is Bakery-controlled.
 * Fully Booked alone is never enough.
 */

import {
  guestPreorderItemFullyBooked,
  selectMostSpecificGuestCapacityRow,
  type GuestCapacityRow,
  type GuestCapacityUsedLine,
} from "@/engines/preorder/capacity";

export function isWaitingListOffered(input: {
  fullyBooked: boolean;
  collectionWaitingListEnabled: boolean;
  capacityWaitingListEnabled: boolean;
}): boolean {
  return (
    input.fullyBooked &&
    input.collectionWaitingListEnabled &&
    input.capacityWaitingListEnabled
  );
}

/**
 * Customer join eligibility for one cake/size on a date.
 * Closed dates: collection + matching capacity Waiting List flags.
 * Open dates: those flags plus the existing Fully Booked rule.
 */
export function isCustomerWaitingListJoinable(input: {
  ordersClosed: boolean;
  collectionWaitingListEnabled: boolean;
  matchingCapacity: boolean;
  capacityWaitingListEnabled: boolean;
  fullyBooked: boolean;
}): boolean {
  if (!input.collectionWaitingListEnabled) return false;
  if (!input.matchingCapacity) return false;
  if (!input.capacityWaitingListEnabled) return false;
  if (input.ordersClosed) return true;
  return input.fullyBooked;
}

export type CustomerWaitingListDateOption = {
  cakeId: string;
  cakeName: string;
  sizeId: string;
  sizeLabel: string;
  price: number;
};

/** Date-level customer-visible Waiting List options. Does not invent new flags. */
export function customerWaitingListOptionsForDate(input: {
  pickupDate: string;
  collectionId: string | null;
  ordersClosed: boolean;
  collectionWaitingListEnabled: boolean;
  sizes: readonly CustomerWaitingListDateOption[];
  rows: readonly GuestCapacityRow[];
  used?: readonly GuestCapacityUsedLine[];
}): CustomerWaitingListDateOption[] {
  if (!input.collectionWaitingListEnabled) return [];
  const seen = new Set<string>();
  const options: CustomerWaitingListDateOption[] = [];
  for (const size of input.sizes) {
    const key = `${size.cakeId}|${size.sizeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = selectMostSpecificGuestCapacityRow(input.rows, {
      pickupDate: input.pickupDate,
      cakeId: size.cakeId,
      sizeId: size.sizeId,
      collectionId: input.collectionId,
    });
    const fullyBooked = guestPreorderItemFullyBooked({
      pickupDate: input.pickupDate,
      collectionId: input.collectionId,
      cakeId: size.cakeId,
      sizeId: size.sizeId,
      quantity: 1,
      rows: input.rows,
      used: input.used ?? [],
    });
    if (
      !isCustomerWaitingListJoinable({
        ordersClosed: input.ordersClosed,
        collectionWaitingListEnabled: true,
        matchingCapacity: Boolean(row),
        capacityWaitingListEnabled: Boolean(row?.waitingListEnabled),
        fullyBooked,
      })
    ) {
      continue;
    }
    options.push(size);
  }
  return options;
}

/** Lines the customer may queue when some cart items are eligible. */
export function waitingListEligibleCartLines<
  T extends { cakeId: string; cakeSizeId: string; quantity: number },
>(input: {
  collectionWaitingListEnabled: boolean;
  cart: readonly T[];
  fullyBookedLineKeys: ReadonlySet<string>;
  capacityWaitingListByLineKey: ReadonlyMap<string, boolean>;
}): T[] {
  if (!input.collectionWaitingListEnabled) return [];
  const eligible: T[] = [];
  const seen = new Set<string>();
  for (const line of input.cart) {
    const key = `${line.cakeId}|${line.cakeSizeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!input.fullyBookedLineKeys.has(key)) continue;
    if (input.capacityWaitingListByLineKey.get(key) !== true) continue;
    eligible.push(line);
  }
  return eligible;
}

export function waitingListCartLineKey(cakeId: string, sizeId: string): string {
  return `${cakeId}|${sizeId}`;
}

export type WaitingListRequestItemInput = {
  cakeId: string;
  sizeId: string;
  quantity: number;
};

/**
 * Merge duplicate cake/size lines and drop zero quantities.
 * Does not cap quantity by production capacity.
 */
export function consolidateWaitingListRequestItems<
  T extends WaitingListRequestItemInput,
>(items: readonly T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const cakeId = item.cakeId.trim();
    const sizeId = item.sizeId.trim();
    const quantity = Math.floor(Number(item.quantity));
    if (!cakeId || !sizeId || !Number.isFinite(quantity) || quantity < 1) {
      continue;
    }
    const key = waitingListCartLineKey(cakeId, sizeId);
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, { ...existing, quantity: existing.quantity + quantity });
      continue;
    }
    merged.set(key, { ...item, cakeId, sizeId, quantity });
  }
  return [...merged.values()];
}
