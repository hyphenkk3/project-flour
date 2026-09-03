/**
 * Waiting-list quantity allocation vs currently available capacity.
 * Holds consume availability until released, converted, or staff records an outcome.
 * Does not count production_capacity_holds inside customer Fully Booked occupancy.
 */

export type WaitingListQueueCandidate = {
  itemId: string;
  remainingQuantity: number;
  queuePosition: number;
  alreadyContacted: boolean;
};

export type WaitingListOffer = {
  itemId: string;
  offeredQuantity: number;
};

export function waitingListAvailableToOffer(input: {
  capacityQuantity: number;
  occupiedQuantity: number;
  activeHoldQuantity: number;
}): number {
  return Math.max(
    0,
    input.capacityQuantity - input.occupiedQuantity - input.activeHoldQuantity,
  );
}

export function offeredQuantityForRemaining(
  available: number,
  remaining: number,
): number {
  if (available < 1 || remaining < 1) return 0;
  return Math.min(available, remaining);
}

/**
 * Queue order. Already-contacted rows keep their hold and are skipped.
 * Multiple customers may be offered in one capacity-increase pass,
 * each for only the quantity still available after earlier offers.
 */
export function allocateWaitingListOffers(
  available: number,
  queue: readonly WaitingListQueueCandidate[],
): WaitingListOffer[] {
  const ordered = [...queue].sort(
    (left, right) => left.queuePosition - right.queuePosition,
  );
  const offers: WaitingListOffer[] = [];
  let left = available;
  for (const candidate of ordered) {
    if (left < 1) break;
    if (candidate.alreadyContacted) continue;
    const offered = offeredQuantityForRemaining(
      left,
      candidate.remainingQuantity,
    );
    if (offered < 1) continue;
    offers.push({ itemId: candidate.itemId, offeredQuantity: offered });
    left -= offered;
  }
  return offers;
}

export function waitingListOverAllocates(input: {
  capacityQuantity: number;
  occupiedQuantity: number;
  activeHoldQuantity: number;
  additionalHold: number;
}): boolean {
  return (
    input.occupiedQuantity + input.activeHoldQuantity + input.additionalHold >
    input.capacityQuantity
  );
}

/** Timer does not start on capacity increase — only when CO contacts. */
export function capacityIncreaseRequiresWaitingListAction(
  previousQuantity: number | null,
  newQuantity: number,
): boolean {
  return previousQuantity != null && newQuantity > previousQuantity;
}

export function waitingListItemMatchesCapacityEvent(input: {
  itemPickupDate: string;
  itemCakeId: string;
  itemSizeId: string | null;
  itemStatus: string;
  eventPickupDate: string;
  eventCakeId: string;
  eventSizeId: string | null;
}): boolean {
  if (input.itemPickupDate !== input.eventPickupDate) return false;
  if (input.itemCakeId !== input.eventCakeId) return false;
  if (
    input.eventSizeId != null &&
    (input.itemSizeId ?? "") !== input.eventSizeId
  ) {
    return false;
  }
  return (
    input.itemStatus === "active" || input.itemStatus === "partially_accepted"
  );
}
