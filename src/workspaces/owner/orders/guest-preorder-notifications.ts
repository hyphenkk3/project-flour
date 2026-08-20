/**
 * Guest Whole Cake preorder toast notifications — preference, eligibility, dedup.
 * Does not contain inbox / Needs Attention business rules.
 */

import { formatShortBusinessDate } from "@/lib/dates";
import type { ToastInput } from "@/components/ui/Toast";
import {
  parseGuestPreorderNotificationPreference,
  readGuestPreorderNotificationPreference,
  type GuestPreorderNotificationMode,
} from "@/foundation/staff/guest-preorder-notification-preference";
import type { StorefrontOrderListItem } from "@/types/storefront";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";
import { isStaffGuestOrderSource } from "@/workspaces/owner/orders/labels";
import type { GuestOrderLiveRow } from "@/workspaces/owner/orders/guest-orders-live";

export const GUEST_PREORDER_NOTIFIED_IDS_KEY = "wos:guest-preorder-notified-ids";
const MAX_NOTIFIED_IDS = 100;

export type GuestPreorderNotificationOrder = Pick<
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
    const raw = localStorage.getItem(GUEST_PREORDER_NOTIFIED_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function writeNotifiedIdList(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const bounded = ids.slice(-MAX_NOTIFIED_IDS);
    localStorage.setItem(
      GUEST_PREORDER_NOTIFIED_IDS_KEY,
      JSON.stringify(bounded),
    );
  } catch {
    // private mode / unavailable
  }
}

export function guestPreorderNotificationAlreadyNotified(
  orderId: string,
): boolean {
  return readNotifiedIdList().includes(orderId);
}

/** Mark orders already on screen so poll/realtime does not toast them. */
export function markGuestPreorderNotificationsSeen(orderIds: string[]): void {
  if (orderIds.length === 0) return;
  const ids = new Set(readNotifiedIdList());
  for (const id of orderIds) {
    ids.add(id);
  }
  writeNotifiedIdList([...ids]);
}

/**
 * Cross-tab dedup: returns false when this order was already notified in any tab.
 */
export function tryClaimGuestPreorderNotification(orderId: string): boolean {
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

function isStaffOrInternalGuestPreorder(input: {
  orderSource: StorefrontOrderListItem["orderSource"];
  crewOrder: boolean;
}): boolean {
  if (input.crewOrder) return true;
  if (isStaffGuestOrderSource(input.orderSource)) return true;
  return (
    input.orderSource === "walk_in" || input.orderSource === "last_minute"
  );
}

/** Eligible: guest website Whole Cake submitted preorder needing prepare_confirmation. */
export function isGuestWholeCakeSubmittedPreorder(
  order: GuestPreorderNotificationOrder,
): boolean {
  if (order.status !== "submitted") return false;
  if (order.extraStockId != null) return false;
  if (isStaffOrInternalGuestPreorder(order)) return false;
  return order.orderSource === "customer_website";
}

/** Early filter on postgres_changes payload before fetching list item. */
export function isGuestWholeCakeSubmittedPreorderLiveRow(
  row: GuestOrderLiveRow | null | undefined,
): row is GuestOrderLiveRow & { id: string } {
  if (!row?.id || row.customer_id != null) return false;
  if (row.status !== "submitted") return false;
  if (row.extra_stock_id != null) return false;
  if (row.crew_order) return false;
  if (row.order_source !== "customer_website") return false;
  return true;
}

export function guestPreorderNotificationDurationMs(
  mode: GuestPreorderNotificationMode,
): number | null {
  if (mode === "persistent") return null;
  return 4500;
}

export function buildGuestPreorderNotificationToast(
  order: GuestPreorderNotificationOrder,
  mode: GuestPreorderNotificationMode,
  returnTo?: string | null,
): ToastInput | null {
  if (mode === "off") return null;
  if (!isGuestWholeCakeSubmittedPreorder(order)) return null;

  const durationMs = guestPreorderNotificationDurationMs(mode);
  const href = ownerOrderWorkspaceHref(order.id, returnTo ?? "/owner");

  return {
    title: "New preorder received",
    description: `${order.customerName} · ${order.cakeName} · ${formatShortBusinessDate(order.pickupDate)}`,
    tone: "info",
    durationMs,
    actionHref: mode === "persistent" ? href : undefined,
    actionLabel: mode === "persistent" ? "View order" : undefined,
  };
}

export function resolveGuestPreorderNotificationMode(
  staffId: string,
  rawPreference?: string | null,
): GuestPreorderNotificationMode {
  if (rawPreference !== undefined) {
    return parseGuestPreorderNotificationPreference(rawPreference);
  }
  return readGuestPreorderNotificationPreference(staffId);
}

export {
  parseGuestPreorderNotificationPreference,
  readGuestPreorderNotificationPreference,
};
