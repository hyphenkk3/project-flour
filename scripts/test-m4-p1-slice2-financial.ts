/**
 * M4-P1 Slice 2 — application financial engine (subtotals, settlement, August, equation).
 * Run: npx tsx scripts/test-m4-p1-slice2-financial.ts
 */
import assert from "node:assert/strict";
import {
  commercialEquationItems,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import {
  evaluateAugustPromoEligibility,
  evaluateAugustPromoRuleFit,
} from "@/engines/orders/promotions";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import {
  calculateCakeSubtotal,
  calculateCommercialSubtotal,
  calculatePaidAddonSubtotal,
  commercialLinesForSettlement,
  normalizePaidAddonLines,
} from "@/engines/orders/totals";

const cake125 = [{ unitPrice: 125, quantity: 1 }];
const bc1 = [
  { unitPrice: 3, quantity: 1, financialShorthand: "BC", code: "birthday_card" },
];
const wc1 = [
  { unitPrice: 3, quantity: 1, financialShorthand: "WC", code: "wishing_card" },
];
const bc2 = [
  { unitPrice: 3, quantity: 2, financialShorthand: "BC", code: "birthday_card" },
];

// A. Subtotals
assert.equal(calculateCakeSubtotal(cake125), 125);
assert.equal(calculatePaidAddonSubtotal([]), 0);
assert.equal(calculateCommercialSubtotal({ items: cake125, paidAddons: [] }), 125);

assert.equal(calculateCakeSubtotal(cake125), 125);
assert.equal(calculatePaidAddonSubtotal(bc1), 3);
assert.equal(
  calculateCommercialSubtotal({ items: cake125, paidAddons: bc1 }),
  128,
);

assert.equal(
  calculateCommercialSubtotal({
    items: cake125,
    paidAddons: [...bc1, ...wc1],
  }),
  131,
);
assert.equal(calculatePaidAddonSubtotal(bc2), 6);

// Legacy / missing normalization
assert.deepEqual(normalizePaidAddonLines(undefined), []);
assert.deepEqual(normalizePaidAddonLines(null), []);
assert.equal(
  calculateCommercialSubtotal({ items: cake125, paidAddons: undefined }),
  125,
);

// B. Settlement
function settle(
  cakes: Array<{ unitPrice: number; quantity: number }>,
  addons: Array<{ unitPrice: number; quantity: number }> = [],
  adjustments: Array<{ amount: number }> = [],
) {
  return calculateOrderSettlement({
    items: commercialLinesForSettlement({ items: cakes, paidAddons: addons }),
    adjustments,
    allocations: [],
    refunds: [],
  });
}

assert.equal(settle(cake125).amountDue, 125);
assert.equal(settle(cake125, bc1).amountDue, 128);
assert.equal(settle(cake125, [...bc1, ...wc1]).amountDue, 131);
assert.equal(
  settle(cake125, [...bc1, ...wc1], [{ amount: -20 }]).amountDue,
  111,
);
assert.equal(settle(cake125, bc1, [{ amount: -10 }]).amountDue, 118);
assert.equal(settle(cake125).subtotal, 125);
assert.equal(settle(cake125, bc1).subtotal, 128);

// Empty add-ons bit-compatible with cake-only settlement
const cakeOnly = settle(cake125);
const cakeOnlyExplicitEmpty = settle(cake125, []);
assert.equal(cakeOnly.amountDue, cakeOnlyExplicitEmpty.amountDue);
assert.equal(cakeOnly.subtotal, cakeOnlyExplicitEmpty.subtotal);

// C. August eligibility — cake subtotal only
const augustBase = {
  orderSource: "customer_website" as const,
  orderDate: "2026-08-01",
  pickupDate: "2026-08-15",
  hasAugustPromo: false,
  hasRm10Card: false,
  hasVerifiedPayments: false,
  orderStatus: "submitted",
};

assert.equal(
  evaluateAugustPromoEligibility({
    ...augustBase,
    cakeSubtotal: calculateCakeSubtotal([{ unitPrice: 99, quantity: 1 }]),
  }).eligible,
  false,
);
assert.equal(
  evaluateAugustPromoEligibility({
    ...augustBase,
    // commercial would be 102 — must still fail on cake 99
    cakeSubtotal: 99,
  }).eligible,
  false,
);
assert.equal(
  evaluateAugustPromoEligibility({
    ...augustBase,
    cakeSubtotal: 100,
  }).eligible,
  false,
);
assert.equal(
  evaluateAugustPromoRuleFit({
    orderSource: "customer_website",
    orderDate: "2026-08-01",
    pickupDate: "2026-08-15",
    cakeSubtotal: 101,
  }).eligible,
  true,
);
assert.equal(
  evaluateAugustPromoEligibility({
    ...augustBase,
    cakeSubtotal: calculateCakeSubtotal(cake125),
  }).eligible,
  true,
);

// D. Equation — locked strings
function eq(
  cakes: Array<{ unitPrice: number; quantity: number }>,
  addons: Array<{
    unitPrice: number;
    quantity: number;
    financialShorthand: string;
  }>,
  amountDue: number,
  adjustments: Array<{
    amount: number;
    label: string;
    code: string;
    metadata?: Record<string, unknown>;
  }> = [],
) {
  return formatOrderFinancialEquation({
    items: commercialEquationItems({ cakes, paidAddons: addons }),
    effective: adjustments,
    amountDue,
  });
}

assert.equal(eq(cake125, bc1, 128), "RM125+RM3(BC)= RM128");
assert.equal(eq(cake125, wc1, 128), "RM125+RM3(WC)= RM128");
assert.equal(
  eq(cake125, [...bc1, ...wc1], 131),
  "RM125+RM3(BC)+RM3(WC)= RM131",
);
assert.equal(
  eq(cake125, [...bc1, ...wc1], 111, [
    {
      amount: -20,
      label: "August Promo",
      code: "august_promo_2026",
    },
  ]),
  "RM125+RM3(BC)+RM3(WC)-RM20(AugPromo)= RM111",
);
assert.equal(
  eq(cake125, bc1, 118, [
    {
      amount: -10,
      label: "RM10 Discount Card",
      code: "rm10_physical_card",
      metadata: { voucher_number: "A038" },
    },
  ]),
  "RM125+RM3(BC)-RM10(Voucher No.A038)= RM118",
);
assert.equal(eq(cake125, bc2, 131), "RM125+RM3*2(BC)= RM131");

// E. Cake-only equation regression (bit-compatible)
assert.equal(
  formatOrderFinancialEquation({
    items: commercialEquationItems({ cakes: cake125, paidAddons: [] }),
    effective: [],
    amountDue: 125,
  }),
  "RM125",
);
assert.equal(
  formatOrderFinancialEquation({
    items: [{ unitPrice: 125, quantity: 1 }],
    effective: [],
    amountDue: 125,
  }),
  "RM125",
);

console.log("M4-P1 Slice 2 financial tests: PASSED");
