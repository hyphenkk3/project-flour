export const WAITING_LIST_SECTION_ID = "waiting-list-heading";

export const WAITING_LIST_FILTER_ACTION =
  `/bakery/availability#${WAITING_LIST_SECTION_ID}` as const;

export function waitingListBoardHref(input: {
  month?: string;
  date?: string;
  cakeId?: string;
  sizeId?: string;
  status?: string;
}): string {
  const params = new URLSearchParams();
  const month = input.month?.trim() ?? "";
  const date = input.date?.trim().slice(0, 10) ?? "";
  const cakeId = input.cakeId?.trim() ?? "";
  const sizeId = input.sizeId?.trim() ?? "";
  const status = input.status?.trim() ?? "";
  if (month) params.set("month", month);
  if (date) params.set("date", date);
  if (cakeId) params.set("wlCake", cakeId);
  if (sizeId) params.set("wlSize", sizeId);
  if (status) params.set("wlStatus", status);
  const query = params.toString();
  return query
    ? `/bakery/availability?${query}#${WAITING_LIST_SECTION_ID}`
    : WAITING_LIST_FILTER_ACTION;
}

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
