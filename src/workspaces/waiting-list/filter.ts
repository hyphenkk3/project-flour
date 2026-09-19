export const WAITING_LIST_SECTION_ID = "waiting-list-heading";

export const WAITING_LIST_FILTER_ACTION =
  `/bakery/availability#${WAITING_LIST_SECTION_ID}` as const;

export type WaitingListFilterCake = {
  id: string;
  sizes: Array<{ id: string; label: string }>;
};

/** Size choices for the staff filter. All cakes → All sizes only. */
export function waitingListFilterSizeOptions(
  cakes: readonly WaitingListFilterCake[],
  cakeId: string,
): Array<{ id: string; label: string }> {
  const id = cakeId.trim();
  if (!id) return [];
  return cakes.find((cake) => cake.id === id)?.sizes ?? [];
}

export function nextWaitingListFilterSizeId(
  sizeOptions: readonly { id: string }[],
  currentSizeId: string,
): string {
  const sizeId = currentSizeId.trim();
  if (!sizeId) return "";
  return sizeOptions.some((size) => size.id === sizeId) ? sizeId : "";
}

export function isWaitingListFilterCakeSizePairValid(
  cakes: readonly WaitingListFilterCake[],
  cakeId: string,
  sizeId: string,
): boolean {
  const size = sizeId.trim();
  if (!size) return true;
  const cake = cakeId.trim();
  if (!cake) return false;
  return waitingListFilterSizeOptions(cakes, cake).some(
    (entry) => entry.id === size,
  );
}
