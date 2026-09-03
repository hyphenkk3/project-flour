/**
 * New order notification eligibility.
 * Toast presentation lives in the seven-category staff notification engine.
 * Dedup is server-side (staff_notification_events.event_key).
 */

import type { StorefrontOrderListItem } from "@/types/storefront";
import type { GuestOrderLiveRow } from "@/workspaces/owner/orders/guest-orders-live";
import { isNewOrderNotificationSource } from "@/foundation/staff/notification-event-identity";

export type NewOrderNotificationOrder = Pick<
  StorefrontOrderListItem,
  | "id"
  | "status"
  | "customerName"
  | "cakeName"
  | "pickupDate"
  | "orderSource"
  | "extraStockId"
  | "crewOrder"
>;

/**
 * A new order notification means a newly submitted customer order,
 * regardless of whether it was submitted through the customer website
 * or created by staff in the Owner workspace.
 *
 * EXTRA / Fresh Picks stock orders are excluded.
 */
export function isNewOrderNotificationEligible(
  order: NewOrderNotificationOrder,
): boolean {
  return isNewOrderNotificationSource({
    status: order.status,
    extraStockId: order.extraStockId,
  });
}

/**
 * Early realtime filter before fetching the complete order list item.
 */
export function isNewOrderNotificationLiveRow(
  row: GuestOrderLiveRow | null | undefined,
): row is GuestOrderLiveRow & { id: string } {
  if (!row?.id) return false;
  return isNewOrderNotificationSource({
    status: row.status ?? "",
    extraStockId: row.extra_stock_id,
  });
}
