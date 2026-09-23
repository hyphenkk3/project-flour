/**
 * Staff overpayment correction. Informational/operational recording only —
 * does not move money through a payment gateway.
 *
 * Uses settlement: remaining excess = overpayment (allocated − due − refunds).
 * Does not rewrite historical payment rows.
 */

import {
  fromCents,
  moneyCompare,
  subtractMoney,
  toCents,
} from "@/engines/orders/money";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { OrderSettlement } from "@/types/storefront";

export const PAYMENT_CORRECTION_TYPE = "overpayment_refund";

export type PaymentCorrectionStatus = "none" | "partial" | "full";

export const PAYMENT_CORRECTION_STATUS_LABEL: Record<
  PaymentCorrectionStatus,
  string
> = {
  none: "No correction",
  partial: "Partially refunded",
  full: "Fully refunded",
};

export const PAYMENT_CORRECTION_INVALID_AMOUNT =
  "Enter a valid refund amount.";
export const PAYMENT_CORRECTION_NO_PAYMENT =
  "This order has no verified payment to correct.";
export const PAYMENT_CORRECTION_NO_EXCESS =
  "There is no overpayment to refund.";
export const PAYMENT_CORRECTION_UNAUTHORIZED =
  "Only Owner or Manager may record a payment correction.";

export type PaymentCorrectionPreview = {
  correctionType: typeof PAYMENT_CORRECTION_TYPE;
  paymentReceived: number;
  orderAmount: number;
  refundAmount: number;
  refundsAlready: number;
  remainingExcessAfter: number;
};

export function remainingRefundableExcess(settlement: OrderSettlement): number {
  return settlement.overpayment;
}

export function paymentCorrectionStatus(
  settlement: OrderSettlement,
): PaymentCorrectionStatus {
  if (moneyCompare(settlement.refundsTotal, 0) <= 0) return "none";
  if (moneyCompare(settlement.overpayment, 0) > 0) return "partial";
  return "full";
}

export function parseRefundAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return null;
  const cents = toCents(amount);
  if (cents <= 0) return null;
  return fromCents(cents);
}

export function refundExceedsRemainingMessage(remaining: number): string {
  return `Refund cannot exceed the remaining overpayment of ${formatRm(remaining)}.`;
}

export function validatePaymentCorrection(input: {
  settlement: OrderSettlement;
  amount: number;
}): { error: string | null; preview: PaymentCorrectionPreview | null } {
  const { settlement, amount } = input;
  const cents = toCents(amount);
  if (!Number.isFinite(amount) || cents <= 0) {
    return { error: PAYMENT_CORRECTION_INVALID_AMOUNT, preview: null };
  }

  if (moneyCompare(settlement.verifiedPaymentsAllocated, 0) <= 0) {
    return { error: PAYMENT_CORRECTION_NO_PAYMENT, preview: null };
  }

  const remaining = remainingRefundableExcess(settlement);
  if (moneyCompare(remaining, 0) <= 0) {
    return { error: PAYMENT_CORRECTION_NO_EXCESS, preview: null };
  }

  const refundAmount = fromCents(cents);
  if (moneyCompare(refundAmount, remaining) > 0) {
    return { error: refundExceedsRemainingMessage(remaining), preview: null };
  }

  return {
    error: null,
    preview: {
      correctionType: PAYMENT_CORRECTION_TYPE,
      paymentReceived: settlement.verifiedPaymentsAllocated,
      orderAmount: settlement.amountDue,
      refundAmount,
      refundsAlready: settlement.refundsTotal,
      remainingExcessAfter: subtractMoney(remaining, refundAmount),
    },
  };
}
