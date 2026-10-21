import type { ExtraLifecycle } from "@/engines/extra/availability";

export type SoldExtraOrderSnapshot = {
  id: string;
  status: string;
  orderSource: string | null;
  customerId: string | null;
  extraStockId: string | null;
  fulfilmentMethod: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  outForDeliveryAt: string | null;
  readyAt: string | null;
  createdAt: string | null;
};

export type SoldExtraDisposition = "active" | "history" | "review";

const ACTIONABLE_ORDER_STATUSES = new Set([
  "submitted",
  "pending_confirmation",
  "confirmed",
  "awaiting_payment",
  "paid",
]);

/**
 * Use the recorded handoff lifecycle, never the scheduled pickup date, to
 * distinguish current work from history. Unknown, cancelled, and unlinked
 * states stay visible for staff review rather than being silently archived.
 */
export function classifySoldExtra(
  order: SoldExtraOrderSnapshot | null,
): SoldExtraDisposition {
  if (!order || order.status === "cancelled") return "review";

  // The dedicated Complete Walk-in Sale RPC records an immediate counter sale
  // but does not write the preorder picked_up_at timestamp.
  if (order.orderSource === "walk_in") {
    return order.status === "paid" ? "history" : "review";
  }

  if (order.fulfilmentMethod === "delivery") {
    if (order.deliveredAt) return "history";
  } else if (
    order.fulfilmentMethod === "pickup" ||
    order.fulfilmentMethod === "dine_in"
  ) {
    if (order.pickedUpAt) return "history";
  } else {
    return "review";
  }

  return ACTIONABLE_ORDER_STATUSES.has(order.status) ? "active" : "review";
}

export function canMarkAssignedPhysicalStockReady(input: {
  lifecycle: ExtraLifecycle;
  soldAt: string | null;
  orderId: string | null;
  cutIntoSlicesAt: string | null;
  walkInHeld: boolean;
  readyForCollection: boolean;
  readinessLinkVerified: boolean;
  order: SoldExtraOrderSnapshot | null;
}): boolean {
  const { order } = input;
  return Boolean(
    input.lifecycle === "confirmed" &&
    input.soldAt &&
    input.orderId &&
    input.cutIntoSlicesAt === null &&
    !input.walkInHeld &&
    !input.readyForCollection &&
    input.readinessLinkVerified &&
    order &&
    order.orderSource === "customer_website" &&
    order.customerId === null &&
    order.extraStockId &&
    ACTIONABLE_ORDER_STATUSES.has(order.status) &&
    order.pickedUpAt === null &&
    order.outForDeliveryAt === null &&
    order.deliveredAt === null,
  );
}

export function soldExtraCompletedAt(
  order: SoldExtraOrderSnapshot | null,
  soldAt: string | null,
): string | null {
  if (!order) return null;
  if (order.orderSource === "walk_in" && order.status === "paid") {
    return order.createdAt ?? soldAt;
  }
  if (order.fulfilmentMethod === "delivery") return order.deliveredAt;
  if (
    order.fulfilmentMethod === "pickup" ||
    order.fulfilmentMethod === "dine_in"
  ) {
    return order.pickedUpAt;
  }
  return null;
}
