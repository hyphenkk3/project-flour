/**
 * M4-P3 — Delivery financial authority helpers + Slice 2A presentation.
 *
 * Authority path:
 *   order_delivery_details finance facts
 *   → _sync_delivery_finance_adjustments
 *   → order_adjustments (delivery_processing_fee / delivery_fee)
 *   → settlement / order_amount_due
 *
 * Waiver restoration: explicit Owner RPCs
 *   restore_guest_order_processing_fee / restore_guest_order_delivery_fee
 * Do not misuse set-quote / override as Undo Waiver.
 */

import type {
  StorefrontOrderDelivery,
  StorefrontOrderFulfilmentMethod,
} from "@/types/storefront";

/** Current business default for NEW governed Delivery processing fees. */
export const CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT = 5;

export const DELIVERY_PROCESSING_FEE_CODE = "delivery_processing_fee" as const;
export const DELIVERY_FEE_CODE = "delivery_fee" as const;

/** Order Workspace Delivery Charges section anchor (Confirmation missing-fee return). */
export const DELIVERY_CHARGES_SECTION_ID = "delivery-charges";

export type DeliveryFeeStatus = "not_set" | "quoted" | "quoted_waived";

export type DeliveryFeeRequestKind =
  | "processing_override"
  | "processing_waiver"
  | "delivery_waiver";

export type DeliveryFeeRequestStatus = "pending" | "approved" | "rejected";

export type DeliveryFinanceFacts = {
  financeEnabled: boolean;
  processingFeeApplicableAmount: number | null;
  processingFeeOverrideAmount: number | null;
  processingFeeWaived: boolean;
  deliveryFeeStatus: DeliveryFeeStatus;
  deliveryFeeQuotedAmount: number | null;
  deliveryFeeWaived: boolean;
};

export function effectiveProcessingFeePayable(
  facts: DeliveryFinanceFacts,
): number {
  if (!facts.financeEnabled) return 0;
  if (facts.processingFeeWaived) return 0;
  const amount =
    facts.processingFeeOverrideAmount ?? facts.processingFeeApplicableAmount;
  return Math.max(0, Number(amount ?? 0));
}

export function effectiveDeliveryFeePayable(facts: DeliveryFinanceFacts): number {
  if (!facts.financeEnabled) return 0;
  if (facts.deliveryFeeStatus !== "quoted") return 0;
  return Math.max(0, Number(facts.deliveryFeeQuotedAmount ?? 0));
}

/** Delivery fee quoted or waived counts as resolved; NOT SET is incomplete. */
export function isDeliveryFinanceComplete(facts: DeliveryFinanceFacts): boolean {
  if (!facts.financeEnabled) return false;
  return (
    facts.deliveryFeeStatus === "quoted" ||
    facts.deliveryFeeStatus === "quoted_waived"
  );
}

/**
 * Canonical Processing waiver. Do not infer from RM0 or a missing adjustment.
 */
export function isProcessingFeeDeliberatelyWaived(
  facts: DeliveryFinanceFacts | null | undefined,
): boolean {
  return Boolean(facts?.financeEnabled && facts.processingFeeWaived);
}

/**
 * Canonical Delivery waiver (`quoted_waived`). NOT SET / quoted / RM0-only
 * absence is not a waiver.
 */
export function isDeliveryFeeDeliberatelyWaived(
  facts: DeliveryFinanceFacts | null | undefined,
): boolean {
  return Boolean(
    facts?.financeEnabled && facts.deliveryFeeStatus === "quoted_waived",
  );
}

/** Shared Confirmation + Delivery Crew waiver traceability (canonical state only). */
export const PROCESSING_FEE_WAIVED_LINE = "Processing Fee: Waived";
export const DELIVERY_FEE_WAIVED_LINE = "Delivery Fee: Waived";

/**
 * Waiver lines outside the financial equation.
 * Processing first, then Delivery. Never NOT SET / RM0 inference.
 */
export function formatDeliveryFinanceWaiverLines(input: {
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | string | null;
  delivery?: StorefrontOrderDelivery | null;
}): string | null {
  if (input.fulfilmentMethod !== "delivery") return null;
  const facts = deliveryFinanceFactsFromDelivery(input.delivery);
  const lines: string[] = [];
  if (isProcessingFeeDeliberatelyWaived(facts)) {
    lines.push(PROCESSING_FEE_WAIVED_LINE);
  }
  if (isDeliveryFeeDeliberatelyWaived(facts)) {
    lines.push(DELIVERY_FEE_WAIVED_LINE);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

export function deliveryFinanceFactsFromDelivery(
  delivery: StorefrontOrderDelivery | null | undefined,
): DeliveryFinanceFacts | null {
  if (!delivery) return null;
  return {
    financeEnabled: Boolean(delivery.financeEnabled),
    processingFeeApplicableAmount: delivery.processingFeeApplicableAmount,
    processingFeeOverrideAmount: delivery.processingFeeOverrideAmount,
    processingFeeWaived: Boolean(delivery.processingFeeWaived),
    deliveryFeeStatus: delivery.deliveryFeeStatus ?? "not_set",
    deliveryFeeQuotedAmount: delivery.deliveryFeeQuotedAmount,
    deliveryFeeWaived: Boolean(delivery.deliveryFeeWaived),
  };
}

/**
 * Amount that a Processing waiver currently suspends (override if present,
 * else applicable). Used for Restore dialog copy — not settlement authority.
 */
export function processingFeeAmountSuspendedByWaiver(
  facts: DeliveryFinanceFacts,
): number {
  if (!facts.financeEnabled || !facts.processingFeeWaived) return 0;
  return Math.max(
    0,
    Number(
      facts.processingFeeOverrideAmount ??
        facts.processingFeeApplicableAmount ??
        0,
    ),
  );
}

/**
 * Quoted Delivery amount suspended by waiver. Restore returns this amount.
 */
export function deliveryFeeAmountSuspendedByWaiver(
  facts: DeliveryFinanceFacts,
): number {
  if (!facts.financeEnabled) return 0;
  if (facts.deliveryFeeStatus !== "quoted_waived") return 0;
  return Math.max(0, Number(facts.deliveryFeeQuotedAmount ?? 0));
}

/** Owner VIEW: show Delivery Charges section only for finance-enabled Delivery. */
export function shouldShowDeliveryChargesSection(order: {
  fulfilmentMethod: string | null | undefined;
  delivery: StorefrontOrderDelivery | null | undefined;
}): boolean {
  if (order.fulfilmentMethod !== "delivery") return false;
  const facts = deliveryFinanceFactsFromDelivery(order.delivery);
  return Boolean(facts?.financeEnabled);
}

/** Owner VIEW: Enable Delivery Charges only for historical finance-disabled Delivery. */
export function shouldShowEnableDeliveryCharges(order: {
  fulfilmentMethod: string | null | undefined;
  delivery: StorefrontOrderDelivery | null | undefined;
}): boolean {
  if (order.fulfilmentMethod !== "delivery") return false;
  if (!order.delivery) return false;
  return !order.delivery.financeEnabled;
}

/** Adjustment codes managed by Delivery finance sync — not shown as discounts. */
export const DELIVERY_FINANCE_ADJUSTMENT_CODES = new Set<string>([
  DELIVERY_PROCESSING_FEE_CODE,
  DELIVERY_FEE_CODE,
]);

export const DELIVERY_FEE_PRIMARY_PRESETS = [5, 10, 15] as const;
export const DELIVERY_FEE_MORE_PRESETS = [20, 25, 30] as const;

export function isDeliveryFinanceAdjustmentCode(
  code: string | null | undefined,
): boolean {
  return Boolean(code && DELIVERY_FINANCE_ADJUSTMENT_CODES.has(code));
}

function formatRmAmount(amount: number): string {
  return `RM${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

export type DeliveryFinanceBreakdownLine = {
  key: "processing" | "delivery";
  label: string;
  /** Compact amount text for Payment / pre-payment breakdown. */
  amountText: string;
};

/**
 * Presentation lines for Payment / Order Total — derived from Delivery finance
 * facts, not from recalculating settlement. Waived fees remain visible as RM0
 * with quoted/applicable truth; NOT SET Delivery fee is omitted (no charge yet).
 */
export function deliveryFinanceBreakdownLines(
  facts: DeliveryFinanceFacts | null | undefined,
): DeliveryFinanceBreakdownLine[] {
  if (!facts?.financeEnabled) return [];

  const lines: DeliveryFinanceBreakdownLine[] = [];
  const applicable = Number(facts.processingFeeApplicableAmount ?? 0);
  const processingPayable = effectiveProcessingFeePayable(facts);

  if (facts.processingFeeWaived) {
    lines.push({
      key: "processing",
      label: "Processing fee",
      amountText: `${formatRmAmount(0)} (${formatRmAmount(applicable)} waived)`,
    });
  } else if (facts.processingFeeOverrideAmount != null) {
    lines.push({
      key: "processing",
      label: "Processing fee",
      amountText: formatRmAmount(processingPayable),
    });
  } else {
    lines.push({
      key: "processing",
      label: "Processing fee",
      amountText: formatRmAmount(processingPayable),
    });
  }

  if (facts.deliveryFeeStatus === "quoted_waived") {
    const quoted = Number(facts.deliveryFeeQuotedAmount ?? 0);
    lines.push({
      key: "delivery",
      label: "Delivery fee",
      amountText: `${formatRmAmount(0)} (${formatRmAmount(quoted)} waived)`,
    });
  } else if (facts.deliveryFeeStatus === "quoted") {
    lines.push({
      key: "delivery",
      label: "Delivery fee",
      amountText: formatRmAmount(effectiveDeliveryFeePayable(facts)),
    });
  }

  return lines;
}

export type DeliveryChargesRemovalWarning = {
  /** True when switching Delivery → Pickup would remove any payable charge. */
  hasRemovableCharges: boolean;
  lines: string[];
  /** Sum of effective payable Delivery finance that will leave amountDue. */
  removableAmount: number;
};

/** Edit-mode warning copy facts when Delivery → Pickup removes charges. */
export function deliveryChargesRemovalWarning(
  facts: DeliveryFinanceFacts | null | undefined,
): DeliveryChargesRemovalWarning {
  if (!facts?.financeEnabled) {
    return { hasRemovableCharges: false, lines: [], removableAmount: 0 };
  }

  const lines: string[] = [];
  let removableAmount = 0;

  const processingPayable = effectiveProcessingFeePayable(facts);
  if (facts.processingFeeWaived) {
    const applicable = Number(facts.processingFeeApplicableAmount ?? 0);
    lines.push(`Processing Fee ${formatRmAmount(0)} (${formatRmAmount(applicable)} waived)`);
  } else if (processingPayable > 0) {
    lines.push(`Processing Fee ${formatRmAmount(processingPayable)}`);
    removableAmount += processingPayable;
  }

  if (facts.deliveryFeeStatus === "quoted_waived") {
    const quoted = Number(facts.deliveryFeeQuotedAmount ?? 0);
    lines.push(
      `Delivery Fee ${formatRmAmount(0)} (${formatRmAmount(quoted)} waived)`,
    );
  } else if (facts.deliveryFeeStatus === "quoted") {
    const deliveryPayable = effectiveDeliveryFeePayable(facts);
    if (deliveryPayable > 0) {
      lines.push(`Delivery Fee ${formatRmAmount(deliveryPayable)}`);
      removableAmount += deliveryPayable;
    }
  } else if (facts.deliveryFeeStatus === "not_set") {
    lines.push("Delivery Fee Not set");
  }

  return {
    hasRemovableCharges: lines.length > 0,
    lines,
    removableAmount,
  };
}
