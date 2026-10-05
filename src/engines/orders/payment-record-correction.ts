import { fromCents, toCents } from "@/engines/orders/money";
import type { PaymentMethodCode } from "@/types/storefront";

export type PaymentCorrectionType = "amount" | "method" | "combined";

export type PaymentCorrectionInput = {
  originalAmount: number;
  correctedAmount: number;
  originalMethod: PaymentMethodCode;
  originalMethodDescription: string | null;
  correctedMethod: PaymentMethodCode;
  correctedMethodDescription: string | null;
  reason: string;
};

export type PaymentCorrectionValidation =
  | { error: string; correctionType: null }
  | { error: null; correctionType: PaymentCorrectionType };

export const PAYMENT_CORRECTION_AMOUNT_ERROR =
  "Enter a valid corrected amount (zero or greater).";
export const PAYMENT_CORRECTION_METHOD_ERROR =
  "Choose a valid corrected payment method.";
export const PAYMENT_CORRECTION_OTHERS_DESCRIPTION_ERROR =
  "Description is required when payment method is Others.";
export const PAYMENT_CORRECTION_REASON_ERROR =
  "Enter a reason for this correction.";
export const PAYMENT_CORRECTION_NOOP_ERROR =
  "Change the amount or payment method before confirming.";

export function parseCorrectedPaymentAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = toCents(amount);
  if (cents < 0) return null;
  return fromCents(cents);
}

export function normalizePaymentMethodDescription(
  method: PaymentMethodCode,
  description: string | null | undefined,
): string | null {
  if (method !== "others") return null;
  const normalized = description?.trim() ?? "";
  return normalized || null;
}

export function validatePaymentCorrection(
  input: PaymentCorrectionInput,
): PaymentCorrectionValidation {
  if (!Number.isFinite(input.correctedAmount) || input.correctedAmount < 0) {
    return { error: PAYMENT_CORRECTION_AMOUNT_ERROR, correctionType: null };
  }
  if (
    input.correctedMethod !== "wb_qr" &&
    input.correctedMethod !== "online_transfer" &&
    input.correctedMethod !== "others"
  ) {
    return { error: PAYMENT_CORRECTION_METHOD_ERROR, correctionType: null };
  }

  const correctedDescription = normalizePaymentMethodDescription(
    input.correctedMethod,
    input.correctedMethodDescription,
  );
  if (input.correctedMethod === "others" && !correctedDescription) {
    return {
      error: PAYMENT_CORRECTION_OTHERS_DESCRIPTION_ERROR,
      correctionType: null,
    };
  }

  const reason = input.reason.trim();
  if (!reason) {
    return { error: PAYMENT_CORRECTION_REASON_ERROR, correctionType: null };
  }

  const amountChanged =
    toCents(input.originalAmount) !== toCents(input.correctedAmount);
  const originalDescription = normalizePaymentMethodDescription(
    input.originalMethod,
    input.originalMethodDescription,
  );
  const methodChanged =
    input.originalMethod !== input.correctedMethod ||
    originalDescription !== correctedDescription;

  if (!amountChanged && !methodChanged) {
    return { error: PAYMENT_CORRECTION_NOOP_ERROR, correctionType: null };
  }

  return {
    error: null,
    correctionType:
      amountChanged && methodChanged
        ? "combined"
        : amountChanged
          ? "amount"
          : "method",
  };
}
