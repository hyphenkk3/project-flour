/**
 * Shared guest-order live-update contract.
 * Used by Operations / Calendar / Home: postgres_changes + poll.
 * Does not contain attention or inbox business rules.
 */

export const GUEST_ORDERS_LIVE_POLL_MS = 30_000;

export type GuestOrderLiveRow = {
  id?: string;
  customer_id?: string | null;
  status?: string;
  extra_stock_id?: string | null;
  order_source?: string | null;
  crew_order?: boolean | null;
};

/** Guest Whole Cake rows are `customer_id = null` (member orders are excluded). */
export function isGuestOrderLiveEvent(
  row: GuestOrderLiveRow | null | undefined,
): row is GuestOrderLiveRow & { id: string } {
  return Boolean(row?.id) && row?.customer_id == null;
}
