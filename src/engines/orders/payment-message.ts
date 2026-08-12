import {
  DELIVERY_FEE_CODE,
  DELIVERY_PROCESSING_FEE_CODE,
} from "@/engines/orders/delivery-finance";
import {
  getPaymentRequestDetails,
  type PaymentRequestMethod,
} from "@/engines/orders/payment-details";
import { moneyCompare } from "@/engines/orders/money";
import { physicalVoucherNumberFromMetadata } from "@/engines/orders/promotions";
import { formatOrderTotal } from "@/engines/orders/totals";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

export type PaymentRequestAdjustmentLine = {
  label: string;
  amount: number;
  code?: string | null;
  /** Optional voucher/reference number from adjustment metadata */
  referenceNumber?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentRequestPayload = {
  /** Commercial subtotal (cakes + paid add-ons) before adjustments. */
  commercialSubtotal: number;
  amountDue: number;
  /** Verified net received for this order (allocations − refunds). */
  netReceived: number;
  /** Outstanding unpaid balance. */
  remainingBalance: number;
  adjustments: PaymentRequestAdjustmentLine[];
  method: PaymentRequestMethod;
};

/** Customer-facing signed money, e.g. -RM20 */
export function formatSignedRm(amount: number): string {
  if (amount < 0) {
    return `-${formatRm(Math.abs(amount))}`;
  }
  if (amount > 0) {
    return `+${formatRm(amount)}`;
  }
  return formatRm(0);
}

/**
 * Customer-facing adjustment label from generic adjustment data.
 * Uses stored label; appends voucher number from metadata when present.
 */
export function customerFacingAdjustmentLabel(
  adjustment: PaymentRequestAdjustmentLine,
): string {
  const code = adjustment.code?.trim() ?? "";
  const baseLabel =
    code === DELIVERY_PROCESSING_FEE_CODE
      ? "Processing Fee"
      : code === DELIVERY_FEE_CODE
        ? "Delivery Fee"
        : adjustment.label;
  const fromMeta = physicalVoucherNumberFromMetadata(adjustment.metadata) ?? "";
  const reference = (adjustment.referenceNumber ?? fromMeta).trim();
  if (!reference) {
    return baseLabel;
  }
  if (baseLabel.includes(`#${reference}`)) {
    return baseLabel;
  }
  return `${baseLabel} #${reference}`;
}

/** True when the customer already has verified money credited on this order. */
export function hasPriorVerifiedPayment(netReceived: number): boolean {
  return moneyCompare(netReceived, 0) > 0;
}

/**
 * Amount the Payment Request asks the customer to pay now.
 * Full amount due when nothing received; otherwise remaining balance only.
 */
export function paymentRequestCollectAmount(payload: {
  amountDue: number;
  netReceived: number;
  remainingBalance: number;
}): number {
  if (!hasPriorVerifiedPayment(payload.netReceived)) {
    return payload.amountDue;
  }
  return Math.max(0, payload.remainingBalance);
}

/**
 * Financial block only — no order recap.
 *
 * First request (nothing received), with adjustments:
 *   Order Total: RM135
 *   August Promo: -RM20
 *   Amount: RM115
 *
 * First request, no adjustments:
 *   Amount: RM135
 *
 * Outstanding balance (prior payment), with adjustments:
 *   Order Total / adjustments / Amount Due / Payment Received / Balance to Pay
 *
 * Outstanding balance, no adjustments:
 *   Order Total / Payment Received / Balance to Pay
 */
export function formatPaymentRequestAmountBlock(payload: {
  commercialSubtotal: number;
  amountDue: number;
  netReceived: number;
  remainingBalance: number;
  adjustments: PaymentRequestAdjustmentLine[];
}): string {
  const orderTotalLabel = formatOrderTotal(payload.commercialSubtotal);
  const amountDueLabel = formatOrderTotal(payload.amountDue);
  const receivedLabel = formatOrderTotal(payload.netReceived);
  const balanceLabel = formatOrderTotal(
    Math.max(0, payload.remainingBalance),
  );

  if (hasPriorVerifiedPayment(payload.netReceived)) {
    const adjustmentLines = payload.adjustments
      .map(
        (row) =>
          `${customerFacingAdjustmentLabel(row)}: ${formatSignedRm(row.amount)}`,
      )
      .join("\n");

    if (payload.adjustments.length === 0) {
      return (
        `Order Total: ${orderTotalLabel}\n` +
        `Payment Received: ${receivedLabel}\n` +
        `Balance to Pay: ${balanceLabel}`
      );
    }

    return (
      `Order Total: ${orderTotalLabel}\n` +
      `${adjustmentLines}\n` +
      `Amount Due: ${amountDueLabel}\n` +
      `Payment Received: ${receivedLabel}\n` +
      `Balance to Pay: ${balanceLabel}`
    );
  }

  if (payload.adjustments.length === 0) {
    return `Amount: ${amountDueLabel}`;
  }

  const adjustmentLines = payload.adjustments
    .map(
      (row) =>
        `${customerFacingAdjustmentLabel(row)}: ${formatSignedRm(row.amount)}`,
    )
    .join("\n");

  return (
    `Order Total: ${orderTotalLabel}\n` +
    `${adjustmentLines}\n` +
    `Amount: ${amountDueLabel}`
  );
}

/**
 * Concise WhatsApp payment request — order details were already confirmed.
 * Preparing / opening / copying must never mark the order Paid.
 * With prior verified payment, asks only for the outstanding balance.
 */
export function generatePaymentRequestMessage(
  payload: PaymentRequestPayload,
): string {
  const details = getPaymentRequestDetails(payload.method);
  const amountBlock = formatPaymentRequestAmountBlock(payload);
  const collectAmount = paymentRequestCollectAmount(payload);
  const collectLabel = formatOrderTotal(collectAmount);
  const hasPrior = hasPriorVerifiedPayment(payload.netReceived);
  const slipLine =
    "Do send us the payment slip WITH Status (Successful etc) once payment is completed ya. 😊";

  if (details.method === "wb_qr") {
    const payLine = hasPrior
      ? `Please make payment of ${collectLabel} using the Whitebird QR code below.`
      : "Please make payment using the Whitebird QR code below.";
    return (
      `Thank you for confirming. ;)\n\n` +
      `Here are the payment details.\n\n` +
      `${amountBlock}\n\n` +
      `${payLine}\n\n` +
      slipLine
    );
  }

  const payLine = hasPrior
    ? `Please transfer ${collectLabel} using the details below.`
    : null;

  return (
    `Thank you for confirming. ;)\n\n` +
    `Here are the payment details.\n\n` +
    `${amountBlock}\n\n` +
    (payLine ? `${payLine}\n\n` : "") +
    `Bank: ${details.bankName}\n` +
    `Account Name: ${details.accountName}\n` +
    `Account No.: ${details.accountNumber}\n\n` +
    slipLine
  );
}

export function buildPaymentRequestPayload(input: {
  commercialSubtotal: number;
  amountDue: number;
  netReceived: number;
  remainingBalance: number;
  adjustments: PaymentRequestAdjustmentLine[];
  method: PaymentRequestMethod;
}): PaymentRequestPayload {
  return {
    commercialSubtotal: input.commercialSubtotal,
    amountDue: input.amountDue,
    netReceived: input.netReceived,
    remainingBalance: input.remainingBalance,
    adjustments: input.adjustments,
    method: input.method,
  };
}
