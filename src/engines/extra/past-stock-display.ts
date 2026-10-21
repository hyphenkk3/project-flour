export const PAST_STOCK_PAGE_SIZE = 20;

export function visiblePastStockPage<T>(
  items: readonly T[],
  count: number,
): T[] {
  return items.slice(0, Math.max(0, count));
}
