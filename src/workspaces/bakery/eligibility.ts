/**
 * M5 Bakery board eligibility + presentation helpers.
 * No network.
 *
 * Visibility ≠ permission to produce.
 * Start is allowed only after commercial confirmation (awaiting_payment | paid).
 */

import type { StatusTone } from "@/lib/design-tokens";
import { isEarlyPickupAttention } from "@/engines/business-calendar/early-pickup";
import { normalizeFulfilmentMethod } from "@/engines/orders/fulfilment";
import { isDeliveryFulfilment } from "@/engines/orders/operational-state";
import type { GuestOrderStatus } from "@/types/storefront";
import type {
  BakeryBoardOrder,
  BakeryPackingReminderItem,
  BakeryProductionPresentation,
} from "@/workspaces/bakery/types";
import {
  bakeryFreshPickStartBlock,
  type BakeryAllocationSummary,
} from "@/engines/bakery/fresh-pick-allocation";

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

/** Derive whole-order readiness from the shared Bakery allocation facts. */
export function bakeryAllocationProductionPresentation(input: {
  productionStartedAt: string | null;
  readyAt: string | null;
  fulfilmentMethod: BakeryBoardOrder["fulfilmentMethod"];
  freshPickAllocation: BakeryBoardOrder["freshPickAllocation"];
  assignedFreshPickStocks: Array<{
    lifecycle: string;
    soldAt: string | null;
    cutIntoSlicesAt: string | null;
    readyForCollection: boolean;
    legacyLinkConflict: boolean;
  }>;
}): BakeryProductionPresentation {
  const orderLifecycle = bakeryProductionPresentation({
    productionStartedAt: input.productionStartedAt,
    readyAt: input.readyAt,
  });

  if (
    isDeliveryFulfilment(input.fulfilmentMethod as never) ||
    input.assignedFreshPickStocks.length === 0
  ) {
    return orderLifecycle;
  }

  const allocation = input.freshPickAllocation;
  if (allocation.status !== "verified") {
    return orderLifecycle === "not_started" ? orderLifecycle : "in_production";
  }

  const assignedStocksAreValid = input.assignedFreshPickStocks.every(
    (stock) =>
      stock.lifecycle === "confirmed" &&
      Boolean(stock.soldAt) &&
      stock.cutIntoSlicesAt === null &&
      !stock.legacyLinkConflict,
  );
  const allAssignedFreshPickIsReady =
    assignedStocksAreValid &&
    allocation.totalAssignedQuantity > 0 &&
    input.assignedFreshPickStocks.length === allocation.totalAssignedQuantity &&
    input.assignedFreshPickStocks.every((stock) => stock.readyForCollection);

  if (
    allAssignedFreshPickIsReady &&
    (allocation.totalRemainingQuantity === 0 || Boolean(input.readyAt))
  ) {
    return "ready";
  }

  // The order-level timestamp covers Bakery-produced quantities, not stock.
  if (input.readyAt && !allAssignedFreshPickIsReady) return "in_production";
  return orderLifecycle;
}

/** Bakery board/detail uses the same allocation-based readiness calculation. */
export function bakeryOrderProductionPresentation(
  order: Pick<
    BakeryBoardOrder,
    | "productionStartedAt"
    | "readyAt"
    | "fulfilmentMethod"
    | "freshPickAllocation"
    | "assignedFreshPickStocks"
  >,
): BakeryProductionPresentation {
  return bakeryAllocationProductionPresentation(order);
}

/**
 * Shared Collection readiness gate for persisted Bakery readiness and fully
 * allocated physical Fresh Pick stock. This is display/eligibility logic only;
 * it never writes orders.ready_at.
 */
export function isBakeryOrderReadyForCollection(input: {
  order: BakeryBoardOrder | null;
  readyAt: string | null;
  status: GuestOrderStatus | string;
  paymentStatus: string | null | undefined;
}): boolean {
  if (!input.order) return Boolean(input.readyAt);
  return isBakeryReadinessReadyForCollection({
    ...input.order,
    readyAt: input.readyAt,
    status: input.status,
    paymentStatus: input.paymentStatus,
  });
}

/** Shared display/eligibility gate for full Bakery rows and Calendar snapshots. */
export function isBakeryReadinessReadyForCollection(input: {
  productionStartedAt: string | null;
  readyAt: string | null;
  fulfilmentMethod: BakeryBoardOrder["fulfilmentMethod"];
  freshPickAllocation: BakeryBoardOrder["freshPickAllocation"];
  assignedFreshPickStocks: Array<{
    lifecycle: string;
    soldAt: string | null;
    cutIntoSlicesAt: string | null;
    readyForCollection: boolean;
    legacyLinkConflict: boolean;
  }>;
  status: GuestOrderStatus | string;
  paymentStatus: string | null | undefined;
}): boolean {
  if (
    bakeryAllocationProductionPresentation(input) !== "ready"
  ) return false;
  // This predicate describes physical/order readiness, not payment eligibility.
  // Collection's server-side handoff gate remains responsible for requiring
  // full settlement before a pickup can be completed.
  return Boolean(input.readyAt) || input.assignedFreshPickStocks.length > 0;
}

export function isBakeryFreshPickReadinessEligible(input: {
  fulfilmentMethod: string | null | undefined;
  pickedUpAt: string | null | undefined;
  outForDeliveryAt: string | null | undefined;
  stock: Pick<
    BakeryBoardOrder["assignedFreshPickStocks"][number],
    | "lifecycle"
    | "soldAt"
    | "cutIntoSlicesAt"
    | "legacyLinkConflict"
  >;
}): boolean {
  return (
    !isDeliveryFulfilment(input.fulfilmentMethod as never) &&
    !input.pickedUpAt &&
    !input.outForDeliveryAt &&
    input.stock.lifecycle === "confirmed" &&
    Boolean(input.stock.soldAt) &&
    input.stock.cutIntoSlicesAt === null &&
    !input.stock.legacyLinkConflict
  );
}

export function bakeryProductionLabel(
  presentation: BakeryProductionPresentation,
): string {
  if (presentation === "ready") return "Ready for Collection";
  if (presentation === "in_production") return "Preparing";
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
  | { kind: "fresh_pick_fulfilled"; reason: string }
  | { kind: "allocation_review"; reason: string }
  | { kind: "fresh_pick_delivery_ready" }
  | { kind: "start_paid"; remainingQuantity?: number }
  | { kind: "start_unsecured"; remainingQuantity?: number }
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
  readyAt?: string | null;
  fulfilmentMethod?: string | null;
  freshPickDeliveryReady?: boolean;
  canStartProduction: boolean;
  canUndoStart: boolean;
  canMarkReady: boolean;
  canUndoReady: boolean;
  freshPickAllocation?: BakeryAllocationSummary;
}): BakeryProductionSurface {
  if (
    input.freshPickDeliveryReady &&
    isDeliveryFulfilment(input.fulfilmentMethod as never) &&
    input.canMarkReady
  ) {
    return { kind: "fresh_pick_delivery_ready" };
  }
  if (input.presentation === "ready") {
    if (
      isDeliveryFulfilment(input.fulfilmentMethod as never) &&
      !input.readyAt
    ) {
      return {
        kind: "fresh_pick_fulfilled",
        reason:
          "Fresh Pick stock is physically ready. Whole-order Delivery readiness requires full payment and an authorized staff confirmation.",
      };
    }
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
  if (input.status === "awaiting_payment" || input.status === "paid") {
    const allocationBlock = input.freshPickAllocation
      ? bakeryFreshPickStartBlock(input.freshPickAllocation)
      : null;
    if (allocationBlock === "review") {
      return {
        kind: "allocation_review",
        reason:
          "Fresh Pick allocation could not be verified. Refresh and ask a Manager to review the stock links before starting production.",
      };
    }
    if (allocationBlock === "fully_covered") {
      return {
        kind: "fresh_pick_fulfilled",
        reason: isDeliveryFulfilment(input.fulfilmentMethod as never)
          ? "All ordered cake quantities are assigned to Fresh Pick. Wait until every cake is physically marked ready, then confirm the order here; do not start Bakery production."
          : "All ordered cake quantities are supplied by assigned Fresh Pick. Use the existing Fresh Pick readiness controls; do not start Bakery production for these cakes.",
      };
    }
    const remainingQuantity =
      input.freshPickAllocation?.status === "verified" &&
      input.freshPickAllocation.totalAssignedQuantity > 0
        ? input.freshPickAllocation.totalRemainingQuantity
        : undefined;
    return input.status === "awaiting_payment"
      ? { kind: "start_unsecured", remainingQuantity }
      : { kind: "start_paid", remainingQuantity };
  }
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
  freshPickAllocation?: BakeryAllocationSummary;
}): BakeryProductionSurface {
  return bakeryProductionSurface({
    canMarkReady: input.canMarkReady ?? false,
    canUndoReady: input.canUndoReady ?? false,
    canStartProduction: input.canStartProduction,
    canUndoStart: input.canUndoStart,
    presentation: input.presentation,
    status: input.status,
    fulfilmentMethod: undefined,
    readyAt: null,
    freshPickDeliveryReady: false,
    freshPickAllocation: input.freshPickAllocation,
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
  if (input.status === "cancelled") return false;
  return input.status === "paid";
}

export function bakeryFulfilmentCue(
  fulfilmentMethod: string | null | undefined,
): "Pickup" | "Delivery" | "Dine-in" {
  if (isDeliveryFulfilment(fulfilmentMethod as never)) return "Delivery";
  if (normalizeFulfilmentMethod(fulfilmentMethod) === "dine_in") return "Dine-in";
  return "Pickup";
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

export type BakeryQueueFilter =
  | "all"
  | "not_ready"
  | "awaiting_prep"
  | "preparing"
  | "ready";

export const BAKERY_QUEUE_FILTERS: Array<{
  value: BakeryQueueFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "not_ready", label: "Payment Pending" },
  { value: "awaiting_prep", label: "Paid / Confirmed" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready for Collection" },
];

export function matchesBakeryQueueFilter(
  order: {
    status: GuestOrderStatus | string;
    productionStartedAt: string | null;
    readyAt: string | null;
    fulfilmentMethod?: BakeryBoardOrder["fulfilmentMethod"];
    freshPickAllocation?: BakeryAllocationSummary;
    assignedFreshPickStocks?: BakeryBoardOrder["assignedFreshPickStocks"];
  },
  filter: BakeryQueueFilter,
): boolean {
  if (filter === "all") return true;
  const presentation =
    order.fulfilmentMethod !== undefined &&
    order.freshPickAllocation !== undefined &&
    order.assignedFreshPickStocks !== undefined
      ? bakeryOrderProductionPresentation({
          productionStartedAt: order.productionStartedAt,
          readyAt: order.readyAt,
          fulfilmentMethod: order.fulfilmentMethod,
          freshPickAllocation: order.freshPickAllocation,
          assignedFreshPickStocks: order.assignedFreshPickStocks,
        })
      : bakeryProductionPresentation({
          productionStartedAt: order.productionStartedAt,
          readyAt: order.readyAt,
        });
  if (filter === "preparing") return presentation === "in_production";
  if (filter === "ready") return presentation === "ready";
  if (presentation !== "not_started") return false;
  if (filter === "awaiting_prep") return order.status === "paid";
  return order.status !== "paid";
}
