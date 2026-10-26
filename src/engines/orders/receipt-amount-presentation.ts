import { DELIVERY_PROCESSING_FEE_CODE } from "@/engines/orders/delivery-finance";

export type ReceiptAmountPresentationInput = {
  fulfilmentMethod: "pickup" | "dine_in" | "delivery";
  deliveryFeeStatus?: string | null;
  deliveryFeeQuotedAmount?: number | null;
  processingFeeAmount?: number | null;
};

export type ReceiptAmountPresentation = {
  amountLabel: "Order amount" | "Total";
  deliveryFeePending: boolean;
  processingFeeAmount: number | null;
};

/** Presentation only: the receipt's settlement amount is never recalculated here. */
export function receiptAmountPresentation(
  input: ReceiptAmountPresentationInput,
): ReceiptAmountPresentation {
  const quotedFeeIsRecorded =
    (input.deliveryFeeStatus === "quoted" ||
      input.deliveryFeeStatus === "quoted_waived") &&
    Number.isFinite(input.deliveryFeeQuotedAmount) &&
    Number(input.deliveryFeeQuotedAmount) > 0;
  const deliveryFeePending =
    input.fulfilmentMethod === "delivery" && !quotedFeeIsRecorded;
  const processingFeeAmount = Number(input.processingFeeAmount);

  return {
    amountLabel: deliveryFeePending ? "Order amount" : "Total",
    deliveryFeePending,
    processingFeeAmount:
      deliveryFeePending &&
      Number.isFinite(processingFeeAmount) &&
      processingFeeAmount > 0
        ? processingFeeAmount
        : null,
  };
}

/** Amount included in settlement, sourced from effective order adjustments. */
export function effectiveReceiptProcessingFeeAmount(
  adjustments: ReadonlyArray<{ code: string | null; amount: number }>,
): number | null {
  const amount = adjustments
    .filter((row) => row.code === DELIVERY_PROCESSING_FEE_CODE)
    .reduce((sum, row) => sum + Number(row.amount), 0);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export const DELIVERY_FEE_PENDING_RECEIPT_EXPLANATION =
  "Your final payable amount will be confirmed once the delivery fee is calculated.";
