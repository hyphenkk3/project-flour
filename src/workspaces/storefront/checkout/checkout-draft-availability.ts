/**
 * Checkout display vs live catalogue.
 * SessionStorage draft is for immediate rendering only.
 * Submit validation remains server-authoritative.
 */

export function isCheckoutCalendarPending(calendarReady: boolean): boolean {
  return !calendarReady;
}

/** Cake identity + quantity only. Price/name updates must not refetch capacity. */
export function checkoutCartCapacityKey(
  items: readonly {
    cakeId: string;
    sizeId: string;
    quantity: number;
  }[],
): string {
  return items
    .map((item) => `${item.cakeId}|${item.sizeId}|${item.quantity}`)
    .join(",");
}

export function isCheckoutLiveOfferPending(
  pickupDate: string,
  resolvedOfferDate: string | null,
): boolean {
  const key = pickupDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return resolvedOfferDate !== key;
}

export function checkoutDraftItemsInCatalogue(
  items: readonly { cakeId: string; sizeId: string }[],
  cakes: readonly { id: string; sizes: readonly { id: string }[] }[],
  liveOfferPending: boolean,
): boolean {
  if (liveOfferPending) return true;
  if (items.length === 0) return true;
  return items.every((item) => {
    const cake = cakes.find((entry) => entry.id === item.cakeId);
    return Boolean(cake?.sizes.some((size) => size.id === item.sizeId));
  });
}
