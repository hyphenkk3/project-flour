/**
 * Pre-confirmation pricing / confirmation financial equation.
 * Run: npx tsx scripts/test-confirmation-financial.ts
 */
import assert from "node:assert/strict";
import {
  buildConfirmationPayload,
  formatConfirmationFinancialBlock,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { financialMateriallyAffectsConfirmation } from "@/engines/orders/confirmation-validity";
import { formatCrewAmountHead } from "@/engines/orders/messages";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import type { OrderAdjustment } from "@/types/storefront";

function basePayload(
  overrides: Partial<Parameters<typeof buildConfirmationPayload>[0]> = {},
) {
  return buildConfirmationPayload({
    staffCustomerFacingName: "Wee",
    customerName: "Lisa",
    customerPhone: "01135062106",
    pickupDate: "2026-08-14",
    pickupTime: "15:00",
    items: [
      {
        cakeName: "Chocolate D'Amour",
        sizeLabel: '8"',
        quantity: 1,
        unitPrice: 135,
      },
    ],
    complimentaryItems: [],
    subtotal: 135,
    adjustments: [],
    amountDue: 135,
    ...overrides,
  });
}

function assertReconcilesToAmountDue(
  block: string,
  amountDue: number,
): void {
  const match = /(?:=\s*)?RM(\d+(?:\.\d+)?)\s*$/.exec(block.trim());
  assert.ok(match, `expected amountDue in equation: ${block}`);
  assert.equal(Number(match[1]), amountDue);
}

// A. Single ×1, no adjustment
const a = basePayload();
assert.equal(formatConfirmationFinancialBlock(a), "RM135");
assert.ok(generateConfirmationMessage(a).includes("\nRM135\n"));
assert.ok(!generateConfirmationMessage(a).includes("Amount Due:"));
assert.ok(!generateConfirmationMessage(a).includes("(NYP)"));
assertReconcilesToAmountDue(formatConfirmationFinancialBlock(a), 135);

// B. Multiple items
const b = basePayload({
  items: [
    {
      cakeName: "Red Dates",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 125,
    },
    {
      cakeName: "Chocolate D'Amour",
      sizeLabel: '8"',
      quantity: 1,
      unitPrice: 165,
    },
  ],
  subtotal: 290,
  amountDue: 290,
  adjustments: [],
});
assert.equal(formatConfirmationFinancialBlock(b), "RM125+RM165= RM290");
assertReconcilesToAmountDue(formatConfirmationFinancialBlock(b), 290);

// C. Quantity
const c = basePayload({
  items: [
    {
      cakeName: "Red Dates",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 125,
    },
    {
      cakeName: "Chocolate D'Amour",
      sizeLabel: '8"',
      quantity: 2,
      unitPrice: 165,
    },
  ],
  subtotal: 455,
  amountDue: 455,
});
assert.equal(formatConfirmationFinancialBlock(c), "RM125+RM165*2= RM455");
assertReconcilesToAmountDue(formatConfirmationFinancialBlock(c), 455);

// D. Mixed quantity
const d = basePayload({
  items: [
    {
      cakeName: "Red Dates",
      sizeLabel: '6"',
      quantity: 2,
      unitPrice: 125,
    },
    {
      cakeName: "Chocolate D'Amour",
      sizeLabel: '8"',
      quantity: 1,
      unitPrice: 165,
    },
  ],
  subtotal: 415,
  amountDue: 415,
});
assert.equal(formatConfirmationFinancialBlock(d), "RM125*2+RM165= RM415");
assertReconcilesToAmountDue(formatConfirmationFinancialBlock(d), 415);

// E. August Promo
const e = basePayload({
  items: [
    {
      cakeName: "Red Dates",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 125,
    },
    {
      cakeName: "Chocolate D'Amour",
      sizeLabel: '8"',
      quantity: 1,
      unitPrice: 165,
    },
  ],
  subtotal: 290,
  amountDue: 270,
  adjustments: [
    {
      label: "August Promo",
      amount: -20,
      code: "august_promo_2026",
    },
  ],
});
assert.equal(
  formatConfirmationFinancialBlock(e),
  "RM125+RM165-RM20(AugPromo)= RM270",
);
assert.ok(
  generateConfirmationMessage(e).includes(
    "RM125+RM165-RM20(AugPromo)= RM270",
  ),
);
assert.ok(!generateConfirmationMessage(e).includes("(NYP)"));
assertReconcilesToAmountDue(formatConfirmationFinancialBlock(e), 270);

// F. Quantity + August Promo
const f = basePayload({
  items: [
    {
      cakeName: "Chocolate D'Amour",
      sizeLabel: '8"',
      quantity: 2,
      unitPrice: 165,
    },
  ],
  subtotal: 330,
  amountDue: 310,
  adjustments: [
    {
      label: "August Promo",
      amount: -20,
      code: "august_promo_2026",
    },
  ],
});
assert.equal(
  formatConfirmationFinancialBlock(f),
  "RM165*2-RM20(AugPromo)= RM310",
);
assertReconcilesToAmountDue(formatConfirmationFinancialBlock(f), 310);

// G. RM10 voucher
const g = basePayload({
  items: [
    {
      cakeName: "Red Dates Serenade Delight",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 125,
    },
  ],
  subtotal: 125,
  amountDue: 115,
  adjustments: [
    {
      label: "RM10 Discount Card",
      amount: -10,
      code: "rm10_physical_card",
      metadata: { voucher_number: "A038" },
    },
  ],
});
assert.equal(
  formatConfirmationFinancialBlock(g),
  "RM125-RM10(Voucher No.A038)= RM115",
);
assert.ok(!formatConfirmationFinancialBlock(g).includes("xxx"));
assert.ok(
  !formatConfirmationFinancialBlock(g).includes("RM10 Discount Card #"),
);
assertReconcilesToAmountDue(formatConfirmationFinancialBlock(g), 115);

// G2. Multiple items + RM10
const g2 = basePayload({
  items: [
    {
      cakeName: "Red Dates",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 125,
    },
    {
      cakeName: "Chocolate D'Amour",
      sizeLabel: '8"',
      quantity: 1,
      unitPrice: 165,
    },
  ],
  subtotal: 290,
  amountDue: 280,
  adjustments: [
    {
      label: "RM10 Discount Card",
      amount: -10,
      code: "rm10_physical_card",
      metadata: { voucher_number: "A038" },
    },
  ],
});
assert.equal(
  formatConfirmationFinancialBlock(g2),
  "RM125+RM165-RM10(Voucher No.A038)= RM280",
);

// H. Reversed adjustment excluded
const adjustments: OrderAdjustment[] = [
  {
    id: "a1",
    orderId: "o1",
    kind: "promotion",
    code: "august_promo_2026",
    label: "August Promo",
    amount: -20,
    reason: null,
    metadata: {},
    status: "reversed",
    reversesAdjustmentId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "a2",
    orderId: "o1",
    kind: "reversal",
    code: "august_promo_2026",
    label: "Reverse August Promo",
    amount: 20,
    reason: null,
    metadata: {},
    status: "active",
    reversesAdjustmentId: "a1",
    createdAt: "2026-08-02T00:00:00.000Z",
  },
];
const effective = getEffectiveAdjustments(adjustments);
assert.equal(effective.length, 0);
const h = basePayload({
  subtotal: 135,
  amountDue: 135,
  adjustments: effective.map((row) => ({
    label: row.label,
    amount: row.amount,
    code: row.code,
    metadata: row.metadata,
  })),
});
assert.equal(formatConfirmationFinancialBlock(h), "RM135");

// Shared with Crew amount head (no payment suffix)
assert.equal(
  formatConfirmationFinancialBlock(c),
  formatCrewAmountHead({
    items: c.items,
    effective: [],
    amountDue: 455,
  }),
);
assert.equal(
  formatConfirmationFinancialBlock(g),
  formatCrewAmountHead({
    items: g.items,
    effective: [
      {
        label: "RM10 Discount Card",
        amount: -10,
        code: "rm10_physical_card",
        metadata: { voucher_number: "A038" },
      },
    ],
    amountDue: 115,
  }),
);

// Financial materiality for pending_confirmation stale path
assert.equal(financialMateriallyAffectsConfirmation(135, 115), true);
assert.equal(financialMateriallyAffectsConfirmation(115, 115), false);

console.log("Confirmation financial tests: PASSED");
