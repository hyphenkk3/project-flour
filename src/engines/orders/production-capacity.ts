/**
 * Production capacity floor — staff-only.
 *
 * No capacity row = unrestricted (customer Fully Booked only applies when a
 * row exists). Capacity 0 = fully booked for that scope.
 *
 * Floor statuses are commercially confirmed Whole Cake commitments, matching
 * Bakery production lock (`awaiting_payment` | `paid`) plus the legacy
 * `confirmed` order_status used by staff-created orders.
 *
 * Not counted: submitted, pending_confirmation (not yet confirmed),
 * cancelled, completed.
 */

export const PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES = [
  "confirmed",
  "awaiting_payment",
  "paid",
] as const;

export type ProductionCapacityFloorOrderStatus =
  (typeof PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES)[number];

export const PRODUCTION_CAPACITY_FLOOR_ERROR =
  "Capacity cannot be reduced below the number of confirmed orders already committed to this date and cake.";

export const PRODUCTION_CAPACITY_REMOVED_EVENT_NOTE = "Removed (unrestricted)";

export type ProductionCapacityScope = {
  pickupDate: string;
  cakeId: string;
  /** Null = cake-wide (all sizes). */
  sizeId: string | null;
  /** Null = not catalogue-scoped. Phase 5.3 UI does not create this. */
  collectionId: string | null;
};

export type CapacityFloorDecision =
  | { ok: true }
  | { ok: false; committedQuantity: number };

export function isProductionCapacityFloorStatus(
  status: string,
): status is ProductionCapacityFloorOrderStatus {
  return (PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES as readonly string[]).includes(
    status,
  );
}

/**
 * Removal (null quantity) restores unrestricted capacity and is never a
 * reduction. Setting a quantity must be >= committed.
 */
export function evaluateProductionCapacityFloor(input: {
  nextQuantity: number | null;
  committedQuantity: number;
}): CapacityFloorDecision {
  if (input.nextQuantity === null) {
    return { ok: true };
  }
  if (input.nextQuantity < 0) {
    return { ok: false, committedQuantity: input.committedQuantity };
  }
  if (input.nextQuantity < input.committedQuantity) {
    return { ok: false, committedQuantity: input.committedQuantity };
  }
  return { ok: true };
}

export function productionCapacityFloorError(committedQuantity: number): string {
  return `${PRODUCTION_CAPACITY_FLOOR_ERROR} Confirmed quantity: ${committedQuantity}.`;
}

/** Whether an order line counts toward a capacity row's confirmed floor. */
export function orderItemCountsTowardCapacityFloor(input: {
  orderStatus: string;
  orderPickupDate: string;
  orderCollectionId: string | null;
  itemCakeId: string;
  itemSizeId: string | null;
  scope: ProductionCapacityScope;
}): boolean {
  if (!isProductionCapacityFloorStatus(input.orderStatus)) return false;
  if (input.orderPickupDate !== input.scope.pickupDate) return false;
  if (input.itemCakeId !== input.scope.cakeId) return false;
  if (
    input.scope.sizeId !== null &&
    input.itemSizeId !== input.scope.sizeId
  ) {
    return false;
  }
  if (
    input.scope.collectionId !== null &&
    input.orderCollectionId !== input.scope.collectionId
  ) {
    return false;
  }
  return true;
}

export function committedQuantityForCapacityScope(
  lines: readonly {
    orderStatus: string;
    orderPickupDate: string;
    orderCollectionId: string | null;
    itemCakeId: string;
    itemSizeId: string | null;
    quantity: number;
  }[],
  scope: ProductionCapacityScope,
): number {
  let total = 0;
  for (const line of lines) {
    if (!orderItemCountsTowardCapacityFloor({ ...line, scope })) continue;
    total += line.quantity;
  }
  return total;
}
