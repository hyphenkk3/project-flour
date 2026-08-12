/**
 * M5-P1 — pure Bakery board eligibility + presentation helpers.
 * No network. Pre-Start equation (Start columns arrive in M5-P2).
 *
 * Visibility ≠ permission to produce. Unsecured preorders are visible for
 * planning; Start rules for unsecured orders are reconciled in M5-P2.
 */

import { isDeliveryFulfilment } from "@/engines/orders/operational-state";
import type { GuestOrderStatus } from "@/types/storefront";
import type {
  BakeryBoardOrder,
  BakeryPackingReminderItem,
  BakeryProductionPresentation,
} from "@/workspaces/bakery/types";

/** Active guest preorder statuses shown on Bakery (canonical lifecycle). */
export const BAKERY_ACTIVE_PREORDER_STATUSES: readonly GuestOrderStatus[] = [
  "submitted",
  "pending_confirmation",
  "awaiting_payment",
  "paid",
];

export type BakeryEligibilityInput = {
  customerId: string | null;
  pickupDate: string;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  fulfilmentMethod: string | null | undefined;
};

function isActivePreorderStatus(status: GuestOrderStatus | string): boolean {
  return (BAKERY_ACTIVE_PREORDER_STATUSES as readonly string[]).includes(
    status,
  );
}

/** Paid · Preorder Secured (canonical). Visibility alone does not imply this. */
export function isBakeryOrderSecured(
  status: GuestOrderStatus | string,
): boolean {
  return status === "paid";
}

/**
 * M5-P1 active-board equation (Product-amended):
 * all active guest preorders for the selected fulfilment date,
 * until Pickup Picked Up / Delivery Out for Delivery.
 */
export function isActiveOnBakeryBoard(input: BakeryEligibilityInput): boolean {
  if (input.customerId != null) return false;
  if (input.pickupDate !== input.selectedPickupDate) return false;
  if (!isActivePreorderStatus(input.status)) return false;

  if (isDeliveryFulfilment(input.fulfilmentMethod as never)) {
    if (input.outForDeliveryAt) return false;
  } else if (input.pickedUpAt) {
    return false;
  }

  return true;
}

/** P1 Payment Attention: Ready but no longer paid (exception after production). */
export function hasPaymentAttention(input: {
  readyAt: string | null;
  status: GuestOrderStatus | string;
}): boolean {
  return Boolean(input.readyAt) && input.status !== "paid";
}

export function bakeryProductionPresentation(input: {
  readyAt: string | null;
}): BakeryProductionPresentation {
  return input.readyAt ? "ready" : "not_started";
}

export function bakeryProductionLabel(
  presentation: BakeryProductionPresentation,
): string {
  return presentation === "ready" ? "Ready" : "Not started";
}

export function bakeryFulfilmentCue(
  fulfilmentMethod: string | null | undefined,
): "Pickup" | "Delivery" {
  return isDeliveryFulfilment(fulfilmentMethod as never)
    ? "Delivery"
    : "Pickup";
}

/** Primary cake line + remaining count for board cards. */
export function bakeryPrimaryCakeSummary(order: Pick<BakeryBoardOrder, "cakeLines">): {
  cakeName: string;
  sizeLabel: string;
  additionalCakeCount: number;
} {
  const first = order.cakeLines[0];
  return {
    cakeName: first?.cakeName ?? "Cake",
    sizeLabel: first?.sizeLabel ?? "Size",
    additionalCakeCount: Math.max(0, order.cakeLines.length - 1),
  };
}

/** Short card excerpt — first line / ~72 chars. */
export function bakeryCustomerNotesExcerpt(
  notes: string | null | undefined,
  maxLen = 72,
): string | null {
  if (!notes) return null;
  const trimmed = notes.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

/**
 * Packing reminder lines from structured truth only (Q6).
 * Local UI checkboxes — not persisted.
 */
export function deriveBakeryPackingReminders(order: {
  complimentaryItems: Array<{ id: string; name: string; quantity: number }>;
  paidAddons: Array<{
    id: string;
    name: string;
    quantity: number;
    messages: Array<{ cardIndex: number; writtenMessage: string | null }>;
  }>;
  includeReceipt: boolean;
}): BakeryPackingReminderItem[] {
  const items: BakeryPackingReminderItem[] = [];

  for (const line of order.complimentaryItems) {
    const qty = Math.max(1, Number(line.quantity) || 1);
    items.push({
      key: `comp:${line.id}`,
      label: qty > 1 ? `${line.name} ×${qty}` : line.name,
    });
  }

  for (const addon of order.paidAddons) {
    const qty = Math.max(1, Number(addon.quantity) || 1);
    items.push({
      key: `addon:${addon.id}`,
      label: qty > 1 ? `${addon.name} ×${qty}` : addon.name,
    });
    for (const message of addon.messages) {
      const text = message.writtenMessage?.trim();
      if (!text) continue;
      items.push({
        key: `addon-msg:${addon.id}:${message.cardIndex}`,
        label:
          qty > 1
            ? `${addon.name} card ${message.cardIndex}: ${text}`
            : `${addon.name}: ${text}`,
      });
    }
  }

  if (order.includeReceipt) {
    items.push({ key: "include-receipt", label: "Include RECEIPT" });
  }

  return items;
}

export function sortBakeryBoardOrders<T extends { pickupTime: string; orderNumber: string }>(
  orders: T[],
): T[] {
  return [...orders].sort((a, b) => {
    const timeCmp = a.pickupTime.localeCompare(b.pickupTime, "en");
    if (timeCmp !== 0) return timeCmp;
    return a.orderNumber.localeCompare(b.orderNumber, "en");
  });
}
