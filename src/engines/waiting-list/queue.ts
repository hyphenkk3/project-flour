import {
  WAITING_LIST_QUEUE_STATUSES,
  type WaitingListItemStatus,
  type WaitingListQueueScope,
  type WaitingListQueueStatus,
} from "@/engines/waiting-list/types";

export function isWaitingListQueueStatus(
  status: string,
): status is WaitingListQueueStatus {
  return (WAITING_LIST_QUEUE_STATUSES as readonly string[]).includes(status);
}

export function waitingListQueueScopeKey(scope: WaitingListQueueScope): string {
  return `${scope.pickupDate}|${scope.cakeId}|${scope.sizeId ?? ""}`;
}

export function nextWaitingListQueuePosition(
  existingPositions: readonly number[],
): number {
  let max = 0;
  for (const position of existingPositions) {
    if (position > max) max = position;
  }
  return max + 1;
}

export function waitingListScopeChanged(
  before: WaitingListQueueScope,
  after: WaitingListQueueScope,
): boolean {
  return (
    before.pickupDate !== after.pickupDate ||
    before.cakeId !== after.cakeId ||
    (before.sizeId ?? "") !== (after.sizeId ?? "")
  );
}

/** Quantity-only edits keep the same queue position. */
export function waitingListQuantityChangeKeepsPosition(): boolean {
  return true;
}

export function waitingListRemainingQuantity(
  quantity: number,
  acceptedQuantity: number,
): number {
  return Math.max(0, quantity - acceptedQuantity);
}

export function waitingListItemAfterPartialAccept(input: {
  quantity: number;
  previouslyAccepted: number;
  newlyAccepted: number;
  keepRemaining: boolean;
}): {
  acceptedQuantity: number;
  remainingQuantity: number;
  status: WaitingListItemStatus;
} {
  const acceptedQuantity = input.previouslyAccepted + input.newlyAccepted;
  const remainingQuantity = waitingListRemainingQuantity(
    input.quantity,
    acceptedQuantity,
  );
  if (remainingQuantity <= 0) {
    return {
      acceptedQuantity,
      remainingQuantity: 0,
      status: "converted",
    };
  }
  if (!input.keepRemaining) {
    return {
      acceptedQuantity,
      remainingQuantity,
      status: "closed",
    };
  }
  return {
    acceptedQuantity,
    remainingQuantity,
    status: "partially_accepted",
  };
}

export function waitingListRequestStatusFromItems(
  itemStatuses: readonly WaitingListItemStatus[],
): "active" | "partially_converted" | "converted" | "cancelled" | "closed" {
  if (itemStatuses.length === 0) return "closed";
  const allCancelled = itemStatuses.every((status) => status === "cancelled");
  if (allCancelled) return "cancelled";
  const allClosed = itemStatuses.every(
    (status) =>
      status === "closed" ||
      status === "cancelled" ||
      status === "converted" ||
      status === "declined" ||
      status === "expired",
  );
  const anyConverted = itemStatuses.some(
    (status) =>
      status === "converted" ||
      status === "partially_accepted" ||
      status === "accepted",
  );
  const anyActive = itemStatuses.some((status) =>
    isWaitingListQueueStatus(status),
  );
  if (anyActive && anyConverted) return "partially_converted";
  if (anyActive) return "active";
  if (anyConverted && allClosed) return "converted";
  if (allClosed) return "closed";
  return "active";
}
