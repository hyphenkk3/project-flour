export type FreshPickAssignmentStock = {
  libraryCakeId: string | null;
  libraryCakeSizeId: string | null;
  cakeName: string;
  sizeLabel: string;
};

export type FreshPickAssignmentOrderItem = {
  cakeId: string | null;
  cakeSizeId: string | null;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
};

export type FreshPickAssignedStock = FreshPickAssignmentStock & {
  id: string;
};

export type FreshPickAssignmentOrderState = {
  status: string;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
};

export type FreshPickAssignmentEligibility = {
  matchesStock: boolean;
  matchingQuantity: number;
  allocatedQuantity: number;
  canAssign: boolean;
  reason: string | null;
};

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("en");
}

/** Keep the picker in step with the database's ID-first, legacy-name fallback. */
export function matchesFreshPickAssignmentItem(
  stock: FreshPickAssignmentStock,
  item: FreshPickAssignmentOrderItem,
): boolean {
  const cakeMatches = stock.libraryCakeId
    ? item.cakeId === stock.libraryCakeId
    : normalized(item.cakeName) === normalized(stock.cakeName);
  const sizeMatches = stock.libraryCakeSizeId
    ? item.cakeSizeId === stock.libraryCakeSizeId
    : normalized(item.sizeLabel) === normalized(stock.sizeLabel);

  return cakeMatches && sizeMatches;
}

/** Legacy allocated stock may have no catalogue ids; only then use its labels. */
export function matchesAssignedFreshPickStock(
  stock: FreshPickAssignmentStock,
  assigned: FreshPickAssignedStock,
): boolean {
  const cakeMatches =
    stock.libraryCakeId && assigned.libraryCakeId
      ? stock.libraryCakeId === assigned.libraryCakeId
      : normalized(stock.cakeName) === normalized(assigned.cakeName);
  const sizeMatches =
    stock.libraryCakeSizeId && assigned.libraryCakeSizeId
      ? stock.libraryCakeSizeId === assigned.libraryCakeSizeId
      : normalized(stock.sizeLabel) === normalized(assigned.sizeLabel);
  return cakeMatches && sizeMatches;
}

export function isFreshPickAssignmentOrderOpen(
  order: FreshPickAssignmentOrderState,
): boolean {
  return (
    order.status !== "cancelled" &&
    order.status !== "completed" &&
    !order.pickedUpAt &&
    !order.outForDeliveryAt &&
    !order.deliveredAt
  );
}

/**
 * A linked EXTRA represents one physical unit. Count each stock id once, even
 * when it is also the order's legacy primary extra_stock_id pointer.
 */
export function assessFreshPickAssignmentEligibility(input: {
  stock: FreshPickAssignmentStock;
  orderItems: readonly FreshPickAssignmentOrderItem[];
  assignedStocks: readonly FreshPickAssignedStock[];
  order: FreshPickAssignmentOrderState;
}): FreshPickAssignmentEligibility {
  if (!isFreshPickAssignmentOrderOpen(input.order)) {
    return {
      matchesStock: false,
      matchingQuantity: 0,
      allocatedQuantity: 0,
      canAssign: false,
      reason: "This order is cancelled, completed, or already handed off.",
    };
  }

  const matchingItems = input.orderItems.filter((item) =>
    matchesFreshPickAssignmentItem(input.stock, item),
  );
  const matchingQuantity = matchingItems.reduce(
    (total, item) => total + Math.max(0, Math.trunc(item.quantity) || 0),
    0,
  );
  if (matchingQuantity === 0) {
    return {
      matchesStock: false,
      matchingQuantity: 0,
      allocatedQuantity: 0,
      canAssign: false,
      reason: "This order does not contain the same cake and size.",
    };
  }

  const assignedById = new Map<string, FreshPickAssignedStock>();
  for (const assigned of input.assignedStocks) {
    assignedById.set(assigned.id, assigned);
  }
  const allocatedQuantity = [...assignedById.values()].filter((assigned) =>
    matchesAssignedFreshPickStock(input.stock, assigned),
  ).length;
  const canAssign = allocatedQuantity < matchingQuantity;

  return {
    matchesStock: true,
    matchingQuantity,
    allocatedQuantity,
    canAssign,
    reason: canAssign
      ? null
      : "All matching cake quantities on this order already have physical stock assigned.",
  };
}
