/**
 * New order web notifications — eligibility, dedup and toast payload.
 *
 * This is intentionally independent of the Operations board UI so the
 * notification rules can be reused by other staff-facing order surfaces.
 */

import { formatShortBusinessDate } from "@/lib/dates";
import type { ToastInput } from "@/components/ui/Toast";
import type {
  StaffNotificationWebMode,
} from "@/foundation/staff/notification-preferences";
import type { StorefrontOrderListItem } from "@/types/storefront";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";
import { isStaffGuestOrderSource } from "@/workspaces/owner/orders/labels";
import type { GuestOrderLiveRow } from "@/workspaces/owner/orders/guest-orders-live";

export const NEW_ORDER_NOTIFIED_IDS_KEY =
  "wos:new-order-notified-ids";

const MAX_NOTIFIED_IDS = 100;

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

function readNotifiedIdList(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(NEW_ORDER_NOTIFIED_IDS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (id): id is string => typeof id === "string",
    );
  } catch {
    return [];
  }
}

function writeNotifiedIdList(ids: string[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      NEW_ORDER_NOTIFIED_IDS_KEY,
      JSON.stringify(ids.slice(-MAX_NOTIFIED_IDS)),
    );
  } catch {
    // private mode / unavailable storage
  }
}

function isStaffOrInternalOrder(input: {
  orderSource: StorefrontOrderListItem["orderSource"];
  crewOrder: boolean;
}): boolean {
  if (input.crewOrder) return true;

  if (isStaffGuestOrderSource(input.orderSource)) return true;

  return (
    input.orderSource === "walk_in" ||
    input.orderSource === "last_minute"
  );
}

/**
 * A new order notification currently means a newly submitted Whole Cake
 * customer-website preorder that is not an EXTRA / internal order.
 */
export function isNewOrderNotificationEligible(
  order: NewOrderNotificationOrder,
): boolean {
  if (order.status !== "submitted") return false;
  if (order.extraStockId != null) return false;
  if (isStaffOrInternalOrder(order)) return false;

  return order.orderSource === "customer_website";
}

/**
 * Early realtime filter before fetching the complete order list item.
 */
export function isNewOrderNotificationLiveRow(
  row: GuestOrderLiveRow | null | undefined,
): row is GuestOrderLiveRow & { id: string } {
  if (!row?.id) return false;
  if (row.customer_id != null) return false;
  if (row.status !== "submitted") return false;
  if (row.extra_stock_id != null) return false;
  if (row.crew_order) return false;

  return row.order_source === "customer_website";
}

/**
 * Cross-tab deduplication.
 *
 * Returns false if another tab has already claimed this order.
 */
export function tryClaimNewOrderNotification(
  orderId: string,
): boolean {
  if (typeof window === "undefined") return false;

  try {
    const ids = readNotifiedIdList();

    if (ids.includes(orderId)) return false;

    ids.push(orderId);
    writeNotifiedIdList(ids);

    return true;
  } catch {
    return false;
  }
}

export function newOrderNotificationDurationMs(
  mode: StaffNotificationWebMode,
): number | null {
  return mode === "persistent" ? null : 4500;
}

export function buildNewOrderNotificationToast(
  order: NewOrderNotificationOrder,
  mode: StaffNotificationWebMode,
  returnTo?: string | null,
): ToastInput | null {
  if (!isNewOrderNotificationEligible(order)) {
    return null;
  }

  const durationMs = newOrderNotificationDurationMs(mode);
  const href = ownerOrderWorkspaceHref(
    order.id,
    returnTo ?? "/owner",
  );

  return {
    title: "New order received",
    description: `${order.customerName} · ${order.cakeName} · ${formatShortBusinessDate(order.pickupDate)}`,
    tone: "info",
    durationMs,
    actionHref: mode === "persistent" ? href : undefined,
    actionLabel: mode === "persistent" ? "View order" : undefined,
  };
}
