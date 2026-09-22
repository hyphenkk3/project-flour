/**
 * Whitebird wholecake preorder payment instruction details.
 * Do not hardcode these values elsewhere.
 */

export type PaymentRequestMethod = "wb_qr" | "online_transfer";

export type PaymentMethod = PaymentRequestMethod | "others";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  wb_qr: "WB QR",
  online_transfer: "Online Transfer",
  others: "Others",
};

export function paymentMethodLabel(
  method: PaymentMethod,
  methodDescription?: string | null,
): string {
  if (method === "others") {
    const detail = methodDescription?.trim();
    return detail ? `Others — ${detail}` : "Others";
  }
  return PAYMENT_METHOD_LABELS[method];
}

export const WHOLECAKE_PREORDER_PAYMENT_QR_SRC =
  "/payment/whitebird_wholecake_payment_qr.png";

export const WHOLECAKE_PREORDER_PAYMENT_QR_LABEL =
  "Whitebird Wholecake Preorder Payment QR";

export const WHOLECAKE_PREORDER_PAYMENT_QR_SCOPE =
  "For wholecake preorder payments only. Not for dine-in, beverages, or other items.";

export type WbQrPaymentDetails = {
  method: "wb_qr";
  label: string;
  /** Customer-facing instruction lines after amount due. */
  instructionLines: string[];
};

export type OnlineTransferPaymentDetails = {
  method: "online_transfer";
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructionLines: string[];
};

export const PAYMENT_DETAILS = {
  wb_qr: {
    method: "wb_qr",
    label: "WB QR",
    instructionLines: [
      "Please make payment using the Whitebird Wholecake Preorder Payment QR below.",
      "This QR is for wholecake preorder payments only. It is not for dine-in, beverages, or other items.",
      "After paying, send us your successful payment slip on WhatsApp for verification.",
    ],
  } satisfies WbQrPaymentDetails,
  online_transfer: {
    method: "online_transfer",
    label: "Online Transfer",
    bankName: "CIMB Bank Berhad",
    accountName: "THE HYPHEN SDN BHD",
    accountNumber: "8604100053",
    instructionLines: [
      "Please transfer the amount due to the account below.",
      "After transferring, send us your successful payment slip on WhatsApp for verification.",
    ],
  } satisfies OnlineTransferPaymentDetails,
} as const;

export function getPaymentRequestDetails(
  method: PaymentRequestMethod,
): WbQrPaymentDetails | OnlineTransferPaymentDetails {
  return PAYMENT_DETAILS[method];
}

/**
 * The supplied QR is wholecake preorder payment only.
 * Do not show it for Fresh Pick / EXTRA sales or dine-in reservations.
 */
export function isWholecakePreorderPaymentContext(input: {
  extraStockId?: string | null;
  fulfilmentMethod?: string | null;
}): boolean {
  if (input.extraStockId) return false;
  if (input.fulfilmentMethod === "dine_in") return false;
  return true;
}

/** Default payment hold: 24 hours after request marked sent. */
export const DEFAULT_PAYMENT_DEADLINE_HOURS = 24;

export function defaultPaymentDeadlineAt(from: Date = new Date()): Date {
  return new Date(
    from.getTime() + DEFAULT_PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000,
  );
}
