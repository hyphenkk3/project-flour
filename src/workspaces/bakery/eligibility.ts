/**
 * M5 Bakery board eligibility + presentation helpers.
 * No network.
 *
 * Visibility ≠ permission to produce.
 * Start is allowed only after commercial confirmation (awaiting_payment | paid).
 */

import type { StatusTone } from "@/lib/design-tokens";
import { isEarlyPickupAttention } from "@/engines/business-calendar/early-pickup";
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

/** Product lock: Start only after customer confirmation. */
export const BAKERY_START_ELIGIBLE_STATUSES: readonly GuestOrderStatus[] = [
  "awaiting_payment",
  "paid",
];

export const BAKERY_WAITING_CONFIRMATION_REASON =
  "Waiting for customer confirmation before production can start.";

export const BAKERY_WAITING_CONFIRMATION_START_LABEL = "Waiting for confirmation";

export const BAKERY_EARLY_PICKUP_DETAIL =
  "Early pickup — this order is due before the usual Bakery pickup window.";

export { isEarlyPickupAttention };

/** Manual Owner flag OR derived early pickup. Does not mutate persistence. */
export function hasEffectiveBakeryAttention(input: {
  needsBakeryAttention: boolean;
  pickupDate: string;
  pickupTime: string;
}): boolean {
  return (
    input.needsBakeryAttention ||
    isEarlyPickupAttention(input.pickupDate, input.pickupTime)
  );
}

/** Board badge label — Early pickup cue when automatic reason applies. */
export function bakeryAttentionBadgeLabel(input: {
  needsBakeryAttention: boolean;
  pickupDate: string;
  pickupTime: string;
}): string | null {
  const early = isEarlyPickupAttention(input.pickupDate, input.pickupTime);
  if (early) return "Bakery Attention · Early pickup";
  if (input.needsBakeryAttention) return "Bakery Attention";
  return null;
}

export type BakeryEligibilityInput = {
  customerId: string | null;
  pickupDate: string;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  productionStartedAt?: string | null;
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

export function isBakeryStartEligibleStatus(
  status: GuestOrderStatus | string,
): boolean {
  return (BAKERY_START_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

export function isWaitingCustomerConfirmation(
  status: GuestOrderStatus | string,
): boolean {
  return status === "submitted" || status === "pending_confirmation";
}

/**
 * Active-board equation:
 * guest + selected fulfilment date + (active preorder status OR already
 * Started/Ready) until Pickup Picked Up / Delivery Out for Delivery.
 * Cancelled never stays. Financial demotion does not clear Start/Ready.
 */
export function isActiveOnBakeryBoard(input: BakeryEligibilityInput): boolean {
  if (input.customerId != null) return false;
  if (input.pickupDate !== input.selectedPickupDate) return false;
  if (input.status === "cancelled") return false;

  if (isDeliveryFulfilment(input.fulfilmentMethod as never)) {
    if (input.outForDeliveryAt) return false;
  } else if (input.pickedUpAt) {
    return false;
  }

  if (isActivePreorderStatus(input.status)) return true;
  return Boolean(input.productionStartedAt) || Boolean(input.readyAt);
}

/** Payment Attention: Started or Ready, and no longer paid. */
export function hasPaymentAttention(input: {
  productionStartedAt?: string | null;
  readyAt: string | null;
  status: GuestOrderStatus | string;
}): boolean {
  const inProduction =
    Boolean(input.productionStartedAt) || Boolean(input.readyAt);
  return inProduction && input.status !== "paid";
}

export function bakeryProductionPresentation(input: {
  productionStartedAt?: string | null;
  readyAt: string | null;
}): BakeryProductionPresentation {
  if (input.readyAt) return "ready";
  if (input.productionStartedAt) return "in_production";
  return "not_started";
}

export function bakeryProductionLabel(
  presentation: BakeryProductionPresentation,
): string {
  if (presentation === "ready") return "Ready";
  if (presentation === "in_production") return "In Production";
  return "Not started";
}

export function bakeryProductionBadgeTone(
  presentation: BakeryProductionPresentation,
): StatusTone {
  if (presentation === "ready") return "success";
  if (presentation === "in_production") return "warning";
  return "info";
}

export type BakeryProductionSurface =
  | { kind: "none" }
  | { kind: "waiting_confirmation"; reason: string }
  | { kind: "start_paid" }
  | { kind: "start_unsecured" }
  | {
      kind: "in_production";
      canUndoStart: boolean;
      canMarkReady: boolean;
    }
  | { kind: "undo_ready" };

/** @deprecated Prefer bakeryProductionSurface — kept for older helper names. */
export type BakeryStartSurface = BakeryProductionSurface;

/**
 * Bakery detail production footer surface.
 * Mark Ready only when In Production (Start required on Bakery — Product Q1=A).
 */
export function bakeryProductionSurface(input: {
  presentation: BakeryProductionPresentation;
  status: GuestOrderStatus | string;
  canStartProduction: boolean;
  canUndoStart: boolean;
  canMarkReady: boolean;
  canUndoReady: boolean;
}): BakeryProductionSurface {
  if (input.presentation === "ready") {
    return input.canUndoReady ? { kind: "undo_ready" } : { kind: "none" };
  }
  if (input.presentation === "in_production") {
    return {
      kind: "in_production",
      canUndoStart: input.canUndoStart,
      canMarkReady: input.canMarkReady,
    };
  }
  if (!input.canStartProduction) return { kind: "none" };
  if (isWaitingCustomerConfirmation(input.status)) {
    return {
      kind: "waiting_confirmation",
      reason: BAKERY_WAITING_CONFIRMATION_REASON,
    };
  }
  if (input.status === "awaiting_payment") return { kind: "start_unsecured" };
  if (input.status === "paid") return { kind: "start_paid" };
  return { kind: "none" };
}

/** Alias used by P2 helpers/tests — same as bakeryProductionSurface without Ready caps. */
export function bakeryStartSurface(input: {
  presentation: BakeryProductionPresentation;
  status: GuestOrderStatus | string;
  canStartProduction: boolean;
  canUndoStart: boolean;
  canMarkReady?: boolean;
  canUndoReady?: boolean;
}): BakeryProductionSurface {
  return bakeryProductionSurface({
    canMarkReady: input.canMarkReady ?? false,
    canUndoReady: input.canUndoReady ?? false,
    canStartProduction: input.canStartProduction,
    canUndoStart: input.canUndoStart,
    presentation: input.presentation,
    status: input.status,
  });
}

/** Bakery-layer Mark Ready gate (Start required). RPC itself stays Start-agnostic. */
export function isBakeryMarkReadyEligible(input: {
  productionStartedAt: string | null | undefined;
  readyAt: string | null | undefined;
  status: GuestOrderStatus | string;
  pickedUpAt?: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
}): boolean {
  if (!input.productionStartedAt) return false;
  if (input.readyAt) return false;
  if (input.pickedUpAt || input.outForDeliveryAt || input.deliveredAt) {
    return false;
  }
  return isBakeryStartEligibleStatus(input.status);
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
 * Local UI checkboxes — not persisted. Does not gate Start.
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
