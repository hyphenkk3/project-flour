/**
 * After order/discount amendments, derive Paid vs Awaiting Payment from settlement.
 * Verified payments are never mutated here.
 */

import type { GuestOrderStatus, OrderSettlement } from "@/types/storefront";

export type PaymentLifecycleReconcileInput = {
  previousStatus: GuestOrderStatus;
  previousNetReceived: number;
  settlement: OrderSettlement;
};

export type PaymentLifecycleReconcileResult = {
  newStatus: GuestOrderStatus;
  statusChanged: boolean;
  enteredPaymentLifecycle: boolean;
};

export function reconcilePaymentLifecycleStatus(
  input: PaymentLifecycleReconcileInput,
): PaymentLifecycleReconcileResult {
  const { previousStatus, previousNetReceived, settlement } = input;
  const netReceived = settlement.netReceived;
  const fullyCovered = settlement.isFullyPaid;

  const enteredPaymentLifecycle =
    previousStatus === "awaiting_payment" ||
    previousStatus === "paid" ||
    previousNetReceived > 0 ||
    netReceived > 0;

  let newStatus: GuestOrderStatus = previousStatus;
  if (enteredPaymentLifecycle) {
    newStatus = fullyCovered ? "paid" : "awaiting_payment";
  }

  return {
    newStatus,
    statusChanged: newStatus !== previousStatus,
    enteredPaymentLifecycle,
  };
}
