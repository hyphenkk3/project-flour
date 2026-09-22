/**
 * Customer acknowledgement of the known Delivery processing fee (RM5).
 * Distinct from cake-size price acknowledgement and from the later Delivery fee.
 *
 * Authoritative amount remains CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT /
 * SQL current_delivery_processing_fee_default(). Do not trust a client fee.
 */

import { CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT } from "@/engines/orders/delivery-finance";
import { addMoney, moneyCompare } from "@/engines/orders/money";

export const DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE =
  "Please acknowledge the RM5 delivery processing fee before submitting your order.";

export const DELIVERY_PROCESSING_FEE_SECTION_TITLE = "Delivery charges";

export const DELIVERY_PROCESSING_FEE_EXPLANATION =
  "A RM5 processing fee applies to all delivery orders.";

export const DELIVERY_FEE_PENDING_EXPLANATION =
  "The delivery fee will be calculated separately based on your delivery location and confirmed with you before the order is finalized.";

export const DELIVERY_PROCESSING_FEE_ACK_LABEL =
  "I understand and accept the RM5 delivery processing fee.";

export const DELIVERY_PROCESSING_FEE_LINE_LABEL = "Delivery processing fee";

export const DELIVERY_FEE_LINE_LABEL = "Delivery fee";

export const DELIVERY_FEE_PENDING_LABEL = "To be confirmed";

export const DELIVERY_FEE_PENDING_CONFIRM_LABEL =
  "To be calculated/confirmed separately";

export const ITEMS_SUBTOTAL_LABEL = "Items subtotal";

export const TOTAL_BEFORE_DELIVERY_FEE_LABEL = "Total before delivery fee";

export type DeliveryProcessingFeeAckPayload = {
  fulfilment_method: "delivery";
  processing_fee: number;
};

export type CheckoutDeliveryChargesBreakdown = {
  itemsSubtotal: number;
  processingFee: number;
  totalBeforeDeliveryFee: number;
};

export function deliveryProcessingFeeAckRequired(
  fulfilmentMethod: string | null | undefined,
): boolean {
  return fulfilmentMethod === "delivery";
}

export function deliveryProcessingFeeAckSnapshot(
  processingFee: number = CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
): string {
  return `delivery|${Math.round(processingFee * 100)}`;
}

export function deliveryProcessingFeeAckSatisfied(input: {
  fulfilmentMethod: string | null | undefined;
  acknowledgedSnapshot: string;
  processingFee?: number;
}): boolean {
  if (!deliveryProcessingFeeAckRequired(input.fulfilmentMethod)) return true;
  return (
    input.acknowledgedSnapshot ===
    deliveryProcessingFeeAckSnapshot(
      input.processingFee ?? CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
    )
  );
}

export function buildDeliveryProcessingFeeAckPayload(
  processingFee: number = CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
): DeliveryProcessingFeeAckPayload {
  return {
    fulfilment_method: "delivery",
    processing_fee: processingFee,
  };
}

export function parseDeliveryProcessingFeeAckPayload(
  value: unknown,
): DeliveryProcessingFeeAckPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const method = String(record.fulfilment_method ?? "")
    .trim()
    .toLowerCase();
  const fee = Number(record.processing_fee);
  if (method !== "delivery" || !Number.isFinite(fee)) return null;
  return {
    fulfilment_method: "delivery",
    processing_fee: fee,
  };
}

export function deliveryProcessingFeeAckMatchesAuthority(input: {
  payload: DeliveryProcessingFeeAckPayload | null;
  fulfilmentMethod: string | null | undefined;
  authoritativeFee?: number;
}): { ok: true } | { ok: false; message: string } {
  if (!deliveryProcessingFeeAckRequired(input.fulfilmentMethod)) {
    return { ok: true };
  }
  const fee =
    input.authoritativeFee ?? CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT;
  const payload = input.payload;
  if (
    !payload ||
    payload.fulfilment_method !== "delivery" ||
    moneyCompare(payload.processing_fee, fee) !== 0
  ) {
    return {
      ok: false,
      message: DELIVERY_PROCESSING_FEE_ACK_REQUIRED_MESSAGE,
    };
  }
  return { ok: true };
}

export function checkoutDeliveryChargesBreakdown(input: {
  fulfilmentMethod: string | null | undefined;
  itemsSubtotal: number;
  processingFee?: number;
}): CheckoutDeliveryChargesBreakdown | null {
  if (!deliveryProcessingFeeAckRequired(input.fulfilmentMethod)) return null;
  const processingFee =
    input.processingFee ?? CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT;
  return {
    itemsSubtotal: input.itemsSubtotal,
    processingFee,
    totalBeforeDeliveryFee: addMoney(input.itemsSubtotal, processingFee),
  };
}

export function isDeliveryProcessingFeeAckError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  return /acknowledge the rm5 delivery processing fee/i.test(message);
}
