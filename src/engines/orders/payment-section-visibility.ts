export type PaymentSectionVisibilityInput = {
  status: string;
  canManagePayments: boolean;
  paymentHistoryCount: number;
  refundHistoryCount: number;
};

export function shouldShowPaymentSection({
  status,
  canManagePayments,
  paymentHistoryCount,
  refundHistoryCount,
}: PaymentSectionVisibilityInput): boolean {
  if (!canManagePayments) return false;
  if (status === "awaiting_payment" || status === "paid") return true;

  return (
    status === "cancelled" &&
    (paymentHistoryCount > 0 || refundHistoryCount > 0)
  );
}

export function canMutatePaymentForOrderStatus(status: string): boolean {
  return status !== "cancelled";
}

export function shouldShowCancelledNoRefundNotice(input: {
  status: string;
  paymentHistoryCount: number;
  refundHistoryCount: number;
}): boolean {
  return (
    input.status === "cancelled" &&
    input.paymentHistoryCount > 0 &&
    input.refundHistoryCount === 0
  );
}
