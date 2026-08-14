/**
 * Owner Operations — derived current attention (pure, not persisted).
 * Slice 1: status + confirmation + fulfilment terminal gating.
 */

import { isReconfirmationCurrentlyActionable } from "@/engines/orders/confirmation-validity";
import {
  isFulfilmentTerminal,
  type OperationalTimestamps,
} from "@/engines/orders/operational-state";
import type {
  GuestOrderStatus,
  StorefrontOrderFulfilmentMethod,
} from "@/types/storefront";

export type OwnerAttentionReasonKey =
  | "prepare_confirmation"
  | "awaiting_customer_confirmation"
  | "reconfirmation_required"
  | "payment_needed"
  | "payment_overdue"
  | "fee_request_pending";

export type OwnerAttentionReason = {
  key: OwnerAttentionReasonKey;
  label: string;
};

export type OwnerAttentionOrderInput = OperationalTimestamps & {
  status: GuestOrderStatus;
  confirmationNeedsResend: boolean;
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  paymentDeadlineAt?: string | null;
  hasPendingFeeRequest?: boolean;
};

export type OwnerOperationsTodayGroup =
  | "needs_attention"
  | "all_clear"
  | "completed";

const LABELS: Record<OwnerAttentionReasonKey, string> = {
  prepare_confirmation: "Confirmation not prepared",
  awaiting_customer_confirmation: "Waiting for customer confirmation",
  reconfirmation_required: "Customer reconfirmation needed",
  payment_needed: "Payment needed",
  payment_overdue: "Payment overdue",
  fee_request_pending: "Fee request pending",
};

function paymentDeadlineIsOverdue(
  status: GuestOrderStatus,
  paymentDeadlineAt: string | null | undefined,
  now: Date,
): boolean {
  if (status !== "awaiting_payment") return false;
  if (!paymentDeadlineAt) return false;
  return new Date(paymentDeadlineAt).getTime() < now.getTime();
}

export function deriveOwnerAttention(
  order: OwnerAttentionOrderInput,
  now: Date = new Date(),
): OwnerAttentionReason[] {
  const reasons: OwnerAttentionReason[] = [];

  if (order.status === "submitted") {
    reasons.push({
      key: "prepare_confirmation",
      label: LABELS.prepare_confirmation,
    });
  }

  const reconfirmationActionable = isReconfirmationCurrentlyActionable({
    status: order.status,
    confirmationNeedsResend: order.confirmationNeedsResend,
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    outForDeliveryAt: order.outForDeliveryAt,
    deliveredAt: order.deliveredAt,
    fulfilmentMethod: order.fulfilmentMethod,
  });

  if (reconfirmationActionable) {
    reasons.push({
      key: "reconfirmation_required",
      label: LABELS.reconfirmation_required,
    });
  } else if (
    order.status === "pending_confirmation" &&
    !order.confirmationNeedsResend
  ) {
    reasons.push({
      key: "awaiting_customer_confirmation",
      label: LABELS.awaiting_customer_confirmation,
    });
  } else if (
    order.status === "pending_confirmation" &&
    order.confirmationNeedsResend &&
    !reconfirmationActionable
  ) {
    // Terminal fulfilment with historical resend flag: no current attention
    // from confirmation. Do not treat as awaiting_customer_confirmation.
  }

  if (order.status === "awaiting_payment") {
    reasons.push({
      key: "payment_needed",
      label: LABELS.payment_needed,
    });
    if (
      order.paymentDeadlineAt != null &&
      paymentDeadlineIsOverdue(order.status, order.paymentDeadlineAt, now)
    ) {
      reasons.push({
        key: "payment_overdue",
        label: LABELS.payment_overdue,
      });
    }
  }

  if (order.hasPendingFeeRequest) {
    reasons.push({
      key: "fee_request_pending",
      label: LABELS.fee_request_pending,
    });
  }

  return reasons;
}

export function ownerOperationsTodayGroup(
  order: OwnerAttentionOrderInput,
  now: Date = new Date(),
): OwnerOperationsTodayGroup {
  if (isFulfilmentTerminal(order)) {
    return "completed";
  }
  if (deriveOwnerAttention(order, now).length > 0) {
    return "needs_attention";
  }
  return "all_clear";
}

function pickupTimeSortKey(pickupTime: string): string {
  const parts = pickupTime.split(":");
  if (parts.length < 2) return pickupTime;
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
}

export function compareByPickupTimeAsc<
  T extends { pickupTime: string; orderNumber?: string; createdAt?: string },
>(a: T, b: T): number {
  const timeCmp = pickupTimeSortKey(a.pickupTime).localeCompare(
    pickupTimeSortKey(b.pickupTime),
    "en",
  );
  if (timeCmp !== 0) return timeCmp;
  if (a.orderNumber && b.orderNumber) {
    return a.orderNumber.localeCompare(b.orderNumber, "en");
  }
  if (a.createdAt && b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt);
  }
  return 0;
}

export function compareCompletedOrdersAsc<
  T extends {
    pickupTime: string;
    pickedUpAt?: string | null;
    deliveredAt?: string | null;
    orderNumber?: string;
  },
>(a: T, b: T): number {
  const aDone = a.deliveredAt ?? a.pickedUpAt ?? "";
  const bDone = b.deliveredAt ?? b.pickedUpAt ?? "";
  if (aDone && bDone) {
    const doneCmp = aDone.localeCompare(bDone);
    if (doneCmp !== 0) return doneCmp;
  }
  return compareByPickupTimeAsc(a, b);
}

export type OwnerOperationsTodayBuckets<T extends OwnerAttentionOrderInput> = {
  needsAttention: T[];
  allClear: T[];
  completed: T[];
};

export function partitionOwnerOperationsTodayOrders<
  T extends OwnerAttentionOrderInput & {
    pickupTime: string;
    orderNumber?: string;
    createdAt?: string;
  },
>(orders: T[], now: Date = new Date()): OwnerOperationsTodayBuckets<T> {
  const needsAttention: T[] = [];
  const allClear: T[] = [];
  const completed: T[] = [];

  for (const order of orders) {
    const group = ownerOperationsTodayGroup(order, now);
    if (group === "needs_attention") needsAttention.push(order);
    else if (group === "completed") completed.push(order);
    else allClear.push(order);
  }

  needsAttention.sort(compareByPickupTimeAsc);
  allClear.sort(compareByPickupTimeAsc);
  completed.sort(compareCompletedOrdersAsc);

  return { needsAttention, allClear, completed };
}
