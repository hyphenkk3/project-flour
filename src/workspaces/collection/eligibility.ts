/**
 * Live Collection — Ready / Pickup / Delivery / Dine-In desks plus
 * Completed + History handoff views.
 * No Arrived / Verified persisted states.
 */

import type { StatusTone } from "@/lib/design-tokens";
import { normalizeFulfilmentMethod } from "@/engines/orders/fulfilment";
import type { GuestOrderStatus } from "@/types/storefront";
import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";
import type { CollectionBoardTab } from "@/workspaces/collection/board-tab";
import { collectionSingaporeWallClock } from "@/workspaces/collection/date";

export type {
  CollectionBoardTab,
  CollectionDineInVenueFilter,
} from "@/workspaces/collection/board-tab";
export {
  parseCollectionBoardTab,
  parseCollectionDineInVenueFilter,
} from "@/workspaces/collection/board-tab";

export const COLLECTION_ACTIVE_PREORDER_STATUSES: readonly GuestOrderStatus[] = [
  "submitted",
  "pending_confirmation",
  "awaiting_payment",
  "paid",
];

/** History lookback ending at the selected board date (inclusive). */
export const COLLECTION_HISTORY_LOOKBACK_DAYS = 30;

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

export function isCollectionDeliveryMethod(
  fulfilmentMethod: string | null | undefined,
): boolean {
  return normalizeFulfilmentMethod(fulfilmentMethod) === "delivery";
}

export function isCollectionDineInMethod(
  fulfilmentMethod: string | null | undefined,
): boolean {
  return normalizeFulfilmentMethod(fulfilmentMethod) === "dine_in";
}

/** Pickup tab / legacy Ready board: pickup Ready, not yet Collected. */
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

/** Alias — Pickup focused queue (same predicate as legacy board). */
export function isActiveOnCollectionPickupBoard(
  input: Parameters<typeof isActiveOnCollectionBoard>[0],
): boolean {
  return isActiveOnCollectionBoard(input);
}

/**
 * Delivery tab: delivery guest preorders marked Ready, not yet Delivered.
 * Out-for-delivery remains visible until Delivered (handoff not complete).
 */
export function isActiveOnCollectionDeliveryBoard(input: {
  customerId: string | null;
  pickupDate: string;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  readyAt: string | null;
  deliveredAt: string | null;
}): boolean {
  if (input.customerId != null) return false;
  if (input.pickupDate !== input.selectedPickupDate) return false;
  if (!isCollectionActiveStatus(input.status)) return false;
  if (!isCollectionDeliveryMethod(input.fulfilmentMethod)) return false;
  if (!input.readyAt) return false;
  if (input.deliveredAt) return false;
  return true;
}

/**
 * Active Collection Dine-in desk: today's dine-in guest preorders
 * not yet completed. Ready is displayed, not required to appear.
 */
export function isActiveOnCollectionDineInBoard(input: {
  customerId: string | null;
  pickupDate: string;
  reservationDate: string | null | undefined;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  pickedUpAt: string | null;
}): boolean {
  if (input.customerId != null) return false;
  if (input.reservationDate !== input.selectedPickupDate) return false;
  if (!isCollectionActiveStatus(input.status)) return false;
  if (!isCollectionDineInMethod(input.fulfilmentMethod)) return false;
  if (input.pickedUpAt) return false;
  return true;
}

/** Ready tab dine-in subset: reservation is Ready, not yet completed. */
export function isActiveOnCollectionDineInReadyBoard(input: {
  customerId: string | null;
  pickupDate: string;
  reservationDate: string | null | undefined;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  readyAt: string | null;
  pickedUpAt: string | null;
}): boolean {
  if (!input.readyAt) return false;
  return isActiveOnCollectionDineInBoard(input);
}

/**
 * General Ready tab: pickup-ready, delivery-ready, and dine-in-ready.
 * Does not include dine-in reservations that are not yet Ready.
 */
export function isActiveOnCollectionReadyQueue(input: {
  customerId: string | null;
  pickupDate: string;
  reservationDate: string | null | undefined;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}): boolean {
  if (
    isActiveOnCollectionPickupBoard({
      customerId: input.customerId,
      pickupDate: input.pickupDate,
      selectedPickupDate: input.selectedPickupDate,
      status: input.status,
      fulfilmentMethod: input.fulfilmentMethod,
      readyAt: input.readyAt,
      pickedUpAt: input.pickedUpAt,
    })
  ) {
    return true;
  }
  if (
    isActiveOnCollectionDeliveryBoard({
      customerId: input.customerId,
      pickupDate: input.pickupDate,
      selectedPickupDate: input.selectedPickupDate,
      status: input.status,
      fulfilmentMethod: input.fulfilmentMethod,
      readyAt: input.readyAt,
      deliveredAt: input.deliveredAt,
    })
  ) {
    return true;
  }
  return isActiveOnCollectionDineInReadyBoard({
    customerId: input.customerId,
    pickupDate: input.pickupDate,
    reservationDate: input.reservationDate,
    selectedPickupDate: input.selectedPickupDate,
    status: input.status,
    fulfilmentMethod: input.fulfilmentMethod,
    readyAt: input.readyAt,
    pickedUpAt: input.pickedUpAt,
  });
}

/**
 * Completed desk handoff: Pickup → Picked Up, Delivery → Delivered.
 * Guest preorders only.
 */
export function isCompletedCollectionHandoff(input: {
  customerId: string | null;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}): boolean {
  if (input.customerId != null) return false;
  if (!isCollectionActiveStatus(input.status)) return false;
  if (isCollectionPickupMethod(input.fulfilmentMethod)) {
    return Boolean(input.pickedUpAt);
  }
  if (isCollectionDeliveryMethod(input.fulfilmentMethod)) {
    return Boolean(input.deliveredAt);
  }
  if (isCollectionDineInMethod(input.fulfilmentMethod)) {
    return Boolean(input.pickedUpAt);
  }
  return false;
}

/** Same-day / selected-date completed handoffs (Completed tab). */
export function isCompletedOnCollectionBoard(input: {
  customerId: string | null;
  pickupDate: string;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}): boolean {
  if (input.pickupDate !== input.selectedPickupDate) return false;
  return isCompletedCollectionHandoff(input);
}

/** History window: completed handoffs with pickup_date in [rangeStart, rangeEnd]. */
export function isCompletedInCollectionHistory(input: {
  customerId: string | null;
  pickupDate: string;
  rangeStart: string;
  rangeEnd: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}): boolean {
  if (input.pickupDate < input.rangeStart) return false;
  if (input.pickupDate > input.rangeEnd) return false;
  return isCompletedCollectionHandoff(input);
}

export function collectionHandoffCompletedAt(input: {
  fulfilmentMethod: string | null | undefined;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}): string | null {
  if (isCollectionDeliveryMethod(input.fulfilmentMethod)) {
    return input.deliveredAt;
  }
  if (isCollectionPickupMethod(input.fulfilmentMethod)) {
    return input.pickedUpAt;
  }
  if (isCollectionDineInMethod(input.fulfilmentMethod)) {
    return input.pickedUpAt;
  }
  return input.deliveredAt ?? input.pickedUpAt;
}

/** Newest completed handoffs first (completion timestamp, then order number). */
export function sortCollectionCompletedOrdersDesc<
  T extends {
    fulfilmentMethod: string | null | undefined;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    orderNumber: string;
  },
>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const aDone = collectionHandoffCompletedAt(a) ?? "";
    const bDone = collectionHandoffCompletedAt(b) ?? "";
    if (aDone !== bDone) return bDone.localeCompare(aDone);
    return b.orderNumber.localeCompare(a.orderNumber, "en");
  });
}

/** Detail may open Ready, same-date Collected, or any completed handoff (Open). */
export function isVisibleOnCollectionDetail(input: {
  customerId: string | null;
  pickupDate: string;
  selectedPickupDate: string;
  status: GuestOrderStatus | string;
  fulfilmentMethod: string | null | undefined;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt?: string | null;
}): boolean {
  if (input.customerId != null) return false;
  if (!isCollectionActiveStatus(input.status)) return false;

  if (
    isCompletedCollectionHandoff({
      customerId: input.customerId,
      status: input.status,
      fulfilmentMethod: input.fulfilmentMethod,
      pickedUpAt: input.pickedUpAt,
      deliveredAt: input.deliveredAt ?? null,
    })
  ) {
    return true;
  }

  if (input.pickupDate !== input.selectedPickupDate) return false;
  if (isCollectionDineInMethod(input.fulfilmentMethod)) {
    return !input.pickedUpAt;
  }
  if (isCollectionDeliveryMethod(input.fulfilmentMethod)) {
    // Delivery Ready queue (and detail open while awaiting Delivered)
    return Boolean(input.readyAt) && !input.deliveredAt;
  }
  if (!isCollectionPickupMethod(input.fulfilmentMethod)) return false;
  // Active Pickup Ready queue
  if (input.readyAt && !input.pickedUpAt) return true;
  // Collected with Ready preserved — Undo path
  if (input.readyAt && input.pickedUpAt) return true;
  return false;
}

export type CollectionDeskPresentation =
  | "ready"
  | "out_for_delivery"
  | "collected"
  | "picked_up"
  | "delivered"
  | "dine_in_pending"
  | "dine_in_ready"
  | "dine_in_complete";

export function collectionDeskPresentation(input: {
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt?: string | null;
  outForDeliveryAt?: string | null;
  fulfilmentMethod?: string | null;
}): CollectionDeskPresentation {
  if (
    isCollectionDeliveryMethod(input.fulfilmentMethod) &&
    input.deliveredAt
  ) {
    return "delivered";
  }
  if (
    isCollectionDeliveryMethod(input.fulfilmentMethod) &&
    input.outForDeliveryAt &&
    !input.deliveredAt
  ) {
    return "out_for_delivery";
  }
  if (isCollectionDineInMethod(input.fulfilmentMethod)) {
    if (input.pickedUpAt) return "dine_in_complete";
    return input.readyAt ? "dine_in_ready" : "dine_in_pending";
  }
  if (input.pickedUpAt) {
    return isCollectionPickupMethod(input.fulfilmentMethod ?? "pickup")
      ? "picked_up"
      : "collected";
  }
  return "ready";
}

export function collectionDeskLabel(
  presentation: CollectionDeskPresentation,
): string {
  switch (presentation) {
    case "delivered":
      return "Delivered";
    case "out_for_delivery":
      return "Out for Delivery";
    case "picked_up":
      return "Picked Up";
    case "collected":
      return "Collected";
    case "dine_in_complete":
      return "Completed";
    case "dine_in_ready":
      return "Ready";
    case "dine_in_pending":
      return "Not ready";
    case "ready":
      return "Ready";
  }
}

export function collectionDeskBadgeTone(
  presentation: CollectionDeskPresentation,
): StatusTone {
  if (presentation === "dine_in_pending") return "neutral";
  if (presentation === "out_for_delivery") return "warning";
  if (presentation === "ready" || presentation === "dine_in_ready") {
    return "info";
  }
  return "success";
}

const PICKUP_TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const PICKUP_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseCollectionPickupTime(pickupTime: string): {
  hour: number;
  minute: number;
  second: number;
} | null {
  const match = PICKUP_TIME_RE.exec(pickupTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  return { hour, minute, second };
}

/**
 * Derived Collection attention: Ready and not collected, and Singapore
 * now is at or after pickup date + pickup time. Not a persisted state.
 */
export function isCollectionPickupOverdue(input: {
  pickupDate: string;
  pickupTime: string;
  pickedUpAt: string | null;
  readyAt?: string | null;
  now: Date;
}): boolean {
  if (input.pickedUpAt) return false;
  if (input.readyAt === null) return false;
  const time = parseCollectionPickupTime(input.pickupTime);
  if (!time) return false;
  if (!PICKUP_DATE_RE.test(input.pickupDate.trim())) return false;

  const nowClock = collectionSingaporeWallClock(input.now);
  const pickupDate = input.pickupDate.trim();
  if (pickupDate < nowClock.ymd) return true;
  if (pickupDate > nowClock.ymd) return false;

  const pickupSeconds = time.hour * 3600 + time.minute * 60 + time.second;
  const nowSeconds =
    nowClock.hour * 3600 + nowClock.minute * 60 + nowClock.second;
  return nowSeconds >= pickupSeconds;
}

export const COLLECTION_PICKUP_OVERDUE_LABEL = "Pickup overdue";

export function collectionDeskAttention(input: {
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt?: string | null;
  outForDeliveryAt?: string | null;
  fulfilmentMethod?: string | null;
  pickupDate: string;
  pickupTime: string;
  now: Date;
}): {
  label: string;
  tone: StatusTone;
  overdue: boolean;
} {
  const presentation = collectionDeskPresentation({
    readyAt: input.readyAt,
    pickedUpAt: input.pickedUpAt,
    deliveredAt: input.deliveredAt,
    outForDeliveryAt: input.outForDeliveryAt,
    fulfilmentMethod: input.fulfilmentMethod,
  });
  if (presentation !== "ready") {
    return {
      label: collectionDeskLabel(presentation),
      tone: collectionDeskBadgeTone(presentation),
      overdue: false,
    };
  }
  // Pickup-overdue attention is pickup-desk only — never label Delivery as
  // "Pickup overdue" when the row is still in the Ready presentation.
  if (!isCollectionPickupMethod(input.fulfilmentMethod ?? "pickup")) {
    return {
      label: collectionDeskLabel(presentation),
      tone: collectionDeskBadgeTone(presentation),
      overdue: false,
    };
  }
  const overdue = isCollectionPickupOverdue({
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
    pickedUpAt: input.pickedUpAt,
    readyAt: input.readyAt,
    now: input.now,
  });
  if (overdue) {
    return {
      label: COLLECTION_PICKUP_OVERDUE_LABEL,
      tone: "warning",
      overdue: true,
    };
  }
  return {
    label: collectionDeskLabel(presentation),
    tone: collectionDeskBadgeTone(presentation),
    overdue: false,
  };
}

export function countCollectionPickupOverdue<
  T extends {
    pickupDate: string;
    pickupTime: string;
    pickedUpAt: string | null;
    readyAt: string | null;
  },
>(orders: T[], now: Date): number {
  return orders.filter((order) =>
    isCollectionPickupOverdue({
      pickupDate: order.pickupDate,
      pickupTime: order.pickupTime,
      pickedUpAt: order.pickedUpAt,
      readyAt: order.readyAt,
      now,
    }),
  ).length;
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

/** Collection Complete Dine-in follows the same Ready-before-complete desk rule. */
export function isCollectionCompleteDineInEligible(input: {
  readyAt: string | null;
  pickedUpAt: string | null;
  fulfilmentMethod: string | null | undefined;
  status: GuestOrderStatus | string;
}): boolean {
  if (!isCollectionDineInMethod(input.fulfilmentMethod)) return false;
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

export function isCollectionUndoDineInEligible(input: {
  pickedUpAt: string | null;
  fulfilmentMethod: string | null | undefined;
}): boolean {
  if (!isCollectionDineInMethod(input.fulfilmentMethod)) return false;
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
  if (
    input.presentation === "dine_in_ready" ||
    input.presentation === "ready"
  ) {
    return {
      canMarkCollected:
        input.canMarkCollected && input.markCollectedEligible,
      canUndoCollected: false,
    };
  }
  return {
    canMarkCollected: false,
    canUndoCollected:
      input.presentation === "picked_up" ||
      input.presentation === "collected" ||
      input.presentation === "dine_in_complete"
        ? input.canUndoCollected && input.undoCollectedEligible
        : false,
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

export function sortCollectionDineInBoardOrders<
  T extends {
    dineIn: { reservationTime: string } | null;
    pickupTime: string;
    orderNumber: string;
  },
>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const aRes = a.dineIn?.reservationTime ?? "";
    const bRes = b.dineIn?.reservationTime ?? "";
    if (aRes !== bRes) return aRes.localeCompare(bRes, "en");
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
