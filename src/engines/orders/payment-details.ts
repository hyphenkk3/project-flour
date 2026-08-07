/**
 * Whitebird payment instruction details — Milestone 3 Preview 1 temporary config.
 * Later replaceable by Business Settings. Do not hardcode elsewhere.
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

/**
 * Placeholder operational details for Preview 1.
 * Replace via Business Settings before production rollout.
 */
export const PAYMENT_DETAILS = {
  wb_qr: {
    method: "wb_qr",
    label: "WB QR",
    instructionLines: [
      "Please make payment using the Whitebird QR code we share on WhatsApp.",
      "After paying, send us your successful payment slip on WhatsApp for verification.",
    ],
  } satisfies WbQrPaymentDetails,
  online_transfer: {
    method: "online_transfer",
    label: "Online Transfer",
    bankName: "Maybank",
    accountName: "Whitebird Cake House",
    accountNumber: "123456789012",
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

/** Default payment hold: 24 hours after request marked sent. */
export const DEFAULT_PAYMENT_DEADLINE_HOURS = 24;

export function defaultPaymentDeadlineAt(from: Date = new Date()): Date {
  return new Date(
    from.getTime() + DEFAULT_PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000,
  );
}
