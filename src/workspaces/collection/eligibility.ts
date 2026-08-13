/**
 * Live Collection — pickup desk eligibility (Ready → Collected).
 * No Arrived / Verified persisted states.
 */

import type { StatusTone } from "@/lib/design-tokens";
import { normalizeFulfilmentMethod } from "@/engines/orders/fulfilment";
import type { GuestOrderStatus } from "@/types/storefront";
import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";

export const COLLECTION_ACTIVE_PREORDER_STATUSES: readonly GuestOrderStatus[] = [
  "submitted",
  "pending_confirmation",
  "awaiting_payment",
  "paid",
];

export function isCollectionActiveStatus(
  status: GuestOrderStatus | string,
): boolean {
  return (COLLECTION_ACTIVE_PREORDER_STATUSES as readonly string[]).includes(
    status,
  );
}

export function isCollectionPickupMethod(
  fulfilmentMethod: string | null | undefined,
): boolean {
  return normalizeFulfilmentMethod(fulfilmentMethod) === "pickup";
}

/** Active Collection queue: Ready pickup, not yet Collected. */
export function isActiveOnCollectionBoard(input: {
  customerId: string | null;
  pickupDate: string;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  readyAt: string | null;
  pickedUpAt: string | null;
}): boolean {
  if (input.customerId != null) return false;
  if (input.pickupDate !== input.selectedPickupDate) return false;
  if (!isCollectionActiveStatus(input.status)) return false;
  if (!isCollectionPickupMethod(input.fulfilmentMethod)) return false;
  if (!input.readyAt) return false;
  if (input.pickedUpAt) return false;
  return true;
}

/** Detail may open Ready (active) or same-date Collected (for Undo). */
export function isVisibleOnCollectionDetail(input: {
  customerId: string | null;
  pickupDate: string;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  readyAt: string | null;
  pickedUpAt: string | null;
}): boolean {
  if (input.customerId != null) return false;
  if (input.pickupDate !== input.selectedPickupDate) return false;
  if (!isCollectionActiveStatus(input.status)) return false;
  if (!isCollectionPickupMethod(input.fulfilmentMethod)) return false;
  // Active Ready queue
  if (input.readyAt && !input.pickedUpAt) return true;
  // Collected with Ready preserved — Undo path
  if (input.readyAt && input.pickedUpAt) return true;
  return false;
}

export type CollectionDeskPresentation = "ready" | "collected";

export function collectionDeskPresentation(input: {
  readyAt: string | null;
  pickedUpAt: string | null;
}): CollectionDeskPresentation {
  if (input.pickedUpAt) return "collected";
  return "ready";
}

export function collectionDeskLabel(
  presentation: CollectionDeskPresentation,
): string {
  return presentation === "collected" ? "Collected" : "Ready";
}

export function collectionDeskBadgeTone(
  presentation: CollectionDeskPresentation,
): StatusTone {
  return presentation === "collected" ? "success" : "info";
}

/** Collection Mark Collected requires Ready (stricter than Owner Ops RPC). */
export function isCollectionMarkCollectedEligible(input: {
  readyAt: string | null;
  pickedUpAt: string | null;
  fulfilmentMethod: string | null | undefined;
  status: GuestOrderStatus | string;
}): boolean {
  if (!isCollectionPickupMethod(input.fulfilmentMethod)) return false;
  if (!isCollectionActiveStatus(input.status)) return false;
  if (!input.readyAt) return false;
  if (input.pickedUpAt) return false;
  return true;
}

export function isCollectionUndoCollectedEligible(input: {
  pickedUpAt: string | null;
  fulfilmentMethod: string | null | undefined;
}): boolean {
  if (!isCollectionPickupMethod(input.fulfilmentMethod)) return false;
  return Boolean(input.pickedUpAt);
}

export function collectionHandoffSurface(input: {
  presentation: CollectionDeskPresentation;
  canMarkCollected: boolean;
  canUndoCollected: boolean;
  markCollectedEligible: boolean;
  undoCollectedEligible: boolean;
}): {
  canMarkCollected: boolean;
  canUndoCollected: boolean;
} {
  if (input.presentation === "collected") {
    return {
      canMarkCollected: false,
      canUndoCollected:
        input.canUndoCollected && input.undoCollectedEligible,
    };
  }
  return {
    canMarkCollected:
      input.canMarkCollected && input.markCollectedEligible,
    canUndoCollected: false,
  };
}

export function sortCollectionBoardOrders<
  T extends { pickupTime: string; orderNumber: string },
>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const timeCmp = a.pickupTime.localeCompare(b.pickupTime, "en");
    if (timeCmp !== 0) return timeCmp;
    return a.orderNumber.localeCompare(b.orderNumber, "en");
  });
}

export function isCollectionOrderSecured(
  status: GuestOrderStatus | string,
): boolean {
  return status === "paid";
}

export function hasCollectionPaymentAttention(input: {
  readyAt: string | null;
  status: GuestOrderStatus | string;
}): boolean {
  return Boolean(input.readyAt) && input.status !== "paid";
}

export function collectionPrimaryCakeSummary(order: {
  cakeLines: Array<{ cakeName: string; sizeLabel: string }>;
  guestName: string;
}): {
  cakeName: string;
  sizeLabel: string;
  additionalCakeCount: number;
} {
  const first = order.cakeLines[0];
  return {
    cakeName: first?.cakeName ?? "Order",
    sizeLabel: first?.sizeLabel ?? "",
    additionalCakeCount: Math.max(0, order.cakeLines.length - 1),
  };
}

export type { StorefrontOrderFulfilmentMethod };
