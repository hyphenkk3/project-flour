import {
  getPaymentRequestDetails,
  type PaymentRequestMethod,
} from "@/engines/orders/payment-details";
import { formatOrderTotal } from "@/engines/orders/totals";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

export type PaymentRequestAdjustmentLine = {
  label: string;
  amount: number;
  /** Optional voucher/reference number from adjustment metadata */
  referenceNumber?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentRequestPayload = {
  cakeSubtotal: number;
  amountDue: number;
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
  const fromMeta =
    typeof adjustment.metadata?.voucher_number === "string"
      ? adjustment.metadata.voucher_number.trim()
      : "";
  const reference = (adjustment.referenceNumber ?? fromMeta).trim();
  if (!reference) {
    return adjustment.label;
  }
  if (adjustment.label.includes(`#${reference}`)) {
    return adjustment.label;
  }
  return `${adjustment.label} #${reference}`;
}

/**
 * Financial block only — no order recap.
 * With adjustments:
 *   Cake Total: RM135
 *   August Promo: -RM20
 *   Amount: RM115
 * Without adjustments:
 *   Amount: RM135
 */
export function formatPaymentRequestAmountBlock(payload: {
  cakeSubtotal: number;
  amountDue: number;
  adjustments: PaymentRequestAdjustmentLine[];
}): string {
  const amountLabel = formatOrderTotal(payload.amountDue);
  if (payload.adjustments.length === 0) {
    return `Amount: ${amountLabel}`;
  }

  const cakeTotalLabel = formatOrderTotal(payload.cakeSubtotal);
  const adjustmentLines = payload.adjustments
    .map(
      (row) =>
        `${customerFacingAdjustmentLabel(row)}: ${formatSignedRm(row.amount)}`,
    )
    .join("\n");

  return (
    `Cake Total: ${cakeTotalLabel}\n` +
    `${adjustmentLines}\n` +
    `Amount: ${amountLabel}`
  );
}

/**
 * Concise WhatsApp payment request — order details were already confirmed.
 * Preparing / opening / copying must never mark the order Paid.
 */
export function generatePaymentRequestMessage(
  payload: PaymentRequestPayload,
): string {
  const details = getPaymentRequestDetails(payload.method);
  const amountBlock = formatPaymentRequestAmountBlock(payload);
  const slipLine =
    "Do send us the payment slip WITH Status (Successful etc) once payment is completed ya. 😊";

  if (details.method === "wb_qr") {
    return (
      `Thank you for confirming. ;)\n\n` +
      `Here are the payment details.\n\n` +
      `${amountBlock}\n\n` +
      `Please make payment using the Whitebird QR code below.\n\n` +
      slipLine
    );
  }

  return (
    `Thank you for confirming. ;)\n\n` +
    `Here are the payment details.\n\n` +
    `${amountBlock}\n\n` +
    `Bank: ${details.bankName}\n` +
    `Account Name: ${details.accountName}\n` +
    `Account No.: ${details.accountNumber}\n\n` +
    slipLine
  );
}

export function buildPaymentRequestPayload(input: {
  cakeSubtotal: number;
  amountDue: number;
  adjustments: PaymentRequestAdjustmentLine[];
  method: PaymentRequestMethod;
}): PaymentRequestPayload {
  return {
    cakeSubtotal: input.cakeSubtotal,
    amountDue: input.amountDue,
    adjustments: input.adjustments,
    method: input.method,
  };
}
