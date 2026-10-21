export type CollectionLiveOrderEventRow = {
  id?: string;
  customer_id?: string | null;
};

/** Collection lists guest orders; linked customer orders are outside this board. */
export function isCollectionLiveOrderEvent(
  row: CollectionLiveOrderEventRow | null | undefined,
): row is CollectionLiveOrderEventRow & { id: string; customer_id: null } {
  return Boolean(row?.id) && row?.customer_id === null;
}
