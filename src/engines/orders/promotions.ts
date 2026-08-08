/**
 * August Promo 2026 — temporary promotion rule implementation.
 * Not the financial architecture. Rules will change for future promotions.
 * Later replaceable by Business Settings / Promotions Engine.
 */

import { moneyCompare } from "@/engines/orders/money";

export const AUGUST_PROMO_CODE = "august_promo_2026" as const;
export const AUGUST_PROMO_LABEL = "August Promo";
export const AUGUST_PROMO_AMOUNT = -20;
export const RM10_CARD_CODE = "rm10_physical_card" as const;
export const RM10_CARD_LABEL = "RM10 Discount Card";
export const RM10_CARD_AMOUNT = -10;

export type OrderSource =
  | "customer_website"
  | "jotform"
  | "whatsapp"
  | "whitebird_instagram"
  | "wee"
  | "lex"
  | "walk_in"
  | "last_minute"
  | "other";

export type AugustPromoEligibilityInput = {
  orderSource: OrderSource;
  /** Singapore calendar date of order creation, YYYY-MM-DD */
  orderDate: string;
  /** Pickup date YYYY-MM-DD */
  pickupDate: string;
  /** Cake item subtotal before adjustments */
  subtotal: number;
  hasAugustPromo: boolean;
  hasRm10Card: boolean;
  hasVerifiedPayments: boolean;
  orderStatus: string;
};

export type EligibilityResult = {
  eligible: boolean;
  reason: string | null;
};

/** Order period 27/07/2026–08/08/2026 inclusive; pickup within August 2026. */
export function evaluateAugustPromoEligibility(
  input: AugustPromoEligibilityInput,
): EligibilityResult {
  if (input.hasAugustPromo) {
    return { eligible: false, reason: "August Promo is already applied." };
  }
  if (input.hasRm10Card) {
    return {
      eligible: false,
      reason: "Cannot stack with an RM10 Discount Card on the same order.",
    };
  }
  return evaluateAugustPromoRuleFit(input);
}

/**
 * Rule fit only (dates / source / subtotal). Used to warn when an already-applied
 * promo no longer meets normal eligibility after an amendment — does not auto-remove.
 */
export function evaluateAugustPromoRuleFit(
  input: Pick<
    AugustPromoEligibilityInput,
    "orderSource" | "orderDate" | "pickupDate" | "subtotal"
  >,
): EligibilityResult {
  if (input.orderSource !== "customer_website") {
    return {
      eligible: false,
      reason:
        "August Promo is only for online preorder (customer website). WhatsApp, walk-in, and last-minute orders are not eligible.",
    };
  }
  if (input.orderDate < "2026-07-27" || input.orderDate > "2026-08-08") {
    return {
      eligible: false,
      reason: "Order date is outside 27/07/2026–08/08/2026.",
    };
  }
  if (input.pickupDate < "2026-08-01" || input.pickupDate > "2026-08-31") {
    return {
      eligible: false,
      reason: "Pickup date must be within August 2026.",
    };
  }
  if (moneyCompare(input.subtotal, 100) <= 0) {
    return {
      eligible: false,
      reason: "Whole-cake subtotal must be above RM100.",
    };
  }
  return { eligible: true, reason: null };
}

export function singaporeDateFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function isRm10EligibleSizeLabel(sizeLabel: string): boolean {
  const label = sizeLabel.trim();
  return label === '6"' || label === '8"' || /(?:^|[^0-9])6"/.test(label) || /(?:^|[^0-9])8"/.test(label);
}

export type Rm10EligibilityInput = {
  items: Array<{ sizeLabel: string }>;
  orderDate: string;
  pickupDate: string;
  expiryDate: string;
  hasAugustPromo: boolean;
  hasRm10Card: boolean;
  hasVerifiedPayments: boolean;
  orderStatus: string;
};

export function evaluateRm10CardEligibility(
  input: Rm10EligibilityInput,
): EligibilityResult {
  if (input.hasRm10Card) {
    return {
      eligible: false,
      reason: "An RM10 Discount Card is already applied to this order.",
    };
  }
  if (input.hasAugustPromo) {
    return {
      eligible: false,
      reason: "Cannot stack with August Promo on the same order.",
    };
  }
  return evaluateRm10CardRuleFit(input);
}

/** Size / date rule fit for an already-applied RM10 card (warning only). */
export function evaluateRm10CardRuleFit(
  input: Pick<
    Rm10EligibilityInput,
    "items" | "orderDate" | "pickupDate" | "expiryDate"
  >,
): EligibilityResult {
  if (!input.items.some((item) => isRm10EligibleSizeLabel(item.sizeLabel))) {
    return {
      eligible: false,
      reason: 'RM10 Discount Card requires a 6" or 8" cake on the order.',
    };
  }
  if (input.orderDate > input.expiryDate) {
    return {
      eligible: false,
      reason: "Order date is after voucher expiry.",
    };
  }
  if (input.pickupDate > input.expiryDate) {
    return {
      eligible: false,
      reason: "Pickup date is after voucher expiry.",
    };
  }
  return { eligible: true, reason: null };
}

export function rm10IssuanceSuppressionLabel(
  code: string | null | undefined,
): string | null {
  switch (code) {
    case "august_promo_applied":
      return "August Promo applied";
    case "rm10_voucher_redeemed":
      return "RM10 voucher redeemed";
    default:
      return null;
  }
}

/** Currently effective discounts (excludes reversed originals and reversal rows). */
export function getEffectiveAdjustments<
  T extends {
    status?: string;
    reversesAdjustmentId?: string | null;
  },
>(adjustments: T[]): T[] {
  return adjustments.filter(
    (row) =>
      (row.status ?? "active") === "active" && !row.reversesAdjustmentId,
  );
}

export function hasActiveAdjustmentCode(
  adjustments: Array<{
    code: string | null;
    status?: string;
    reversesAdjustmentId?: string | null;
  }>,
  code: string,
): boolean {
  return getEffectiveAdjustments(adjustments).some((row) => row.code === code);
}
