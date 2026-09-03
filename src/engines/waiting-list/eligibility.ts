/**
 * Waiting-list eligibility is Bakery-controlled.
 * Fully Booked alone is never enough.
 */

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
