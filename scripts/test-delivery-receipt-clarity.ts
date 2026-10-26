/**
 * Delivery receipt wording is presentation-only and shares one receipt model
 * between regular preorder and Fresh Pick. Run: npx tsx scripts/test-delivery-receipt-clarity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DELIVERY_FEE_PENDING_RECEIPT_EXPLANATION,
  effectiveReceiptProcessingFeeAmount,
  receiptAmountPresentation,
} from "@/engines/orders/receipt-amount-presentation";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import {
  buildOrderDetailsCardModel,
  drawOrderDetailsCard,
} from "@/workspaces/storefront/checkout/order-details-card";
import type { GuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function receipt(
  overrides: Partial<GuestPreorderReceipt> = {},
): GuestPreorderReceipt {
  return {
    orderNumber: "DEV-RECEIPT-1",
    guestName: "Synthetic Guest",
    guestPhone: "0000000000",
    notes: null,
    items: [
      {
        key: "cake-1",
        cakeId: "synthetic-cake",
        cakeSizeId: "synthetic-size",
        cakeName: "Synthetic Cake",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 135,
        imageUrl: null,
        imageAlt: null,
      },
    ],
    paidAddons: [],
    complimentaryItems: [],
    pickupDate: "2026-10-27",
    pickupTime: "12:00",
    fulfilmentMethod: "delivery",
    guestCount: null,
    dineInVenue: null,
    reservationTime: null,
    deliveryFeeStatus: "not_set",
    deliveryFeeQuotedAmount: null,
    processingFeeAmount: 5,
    subtotal: 135,
    adjustments: [
      { code: "delivery_processing_fee", label: "Processing Fee", amount: 5 },
    ],
    total: 140,
    placedAt: "2026-10-26T00:00:00.000Z",
    isFreshPick: false,
    ...overrides,
  };
}

const pendingDelivery = receiptAmountPresentation(receipt());
assert.deepEqual(pendingDelivery, {
  amountLabel: "Order amount",
  deliveryFeePending: true,
  processingFeeAmount: 5,
});
assert.equal(
  DELIVERY_FEE_PENDING_RECEIPT_EXPLANATION,
  "Your final payable amount will be confirmed once the delivery fee is calculated.",
);

// Fresh Pick and regular preorder use the same persisted receipt presentation.
assert.deepEqual(
  receiptAmountPresentation(receipt({ isFreshPick: true })),
  pendingDelivery,
);

// Only an effective processing-fee adjustment can produce the included-fee note.
assert.equal(
  effectiveReceiptProcessingFeeAmount([
    { code: "delivery_processing_fee", amount: 5 },
    { code: "delivery_fee", amount: 0 },
  ]),
  5,
);
assert.equal(
  effectiveReceiptProcessingFeeAmount([
    { code: "delivery_processing_fee", amount: 0 },
    { code: "other", amount: 5 },
  ]),
  null,
);
assert.equal(effectiveReceiptProcessingFeeAmount([]), null);
assert.equal(
  receiptAmountPresentation(receipt({ processingFeeAmount: null }))
    .processingFeeAmount,
  null,
);

// A recorded quote (including a recorded waiver) retains the existing Total.
assert.deepEqual(
  receiptAmountPresentation(
    receipt({ deliveryFeeStatus: "quoted", deliveryFeeQuotedAmount: 12 }),
  ),
  {
    amountLabel: "Total",
    deliveryFeePending: false,
    processingFeeAmount: null,
  },
);
assert.equal(
  receiptAmountPresentation(
    receipt({
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 12,
    }),
  ).amountLabel,
  "Total",
);
// Inconsistent/missing quote data is presented conservatively as unresolved.
assert.equal(
  receiptAmountPresentation(
    receipt({ deliveryFeeStatus: "quoted", deliveryFeeQuotedAmount: null }),
  ).deliveryFeePending,
  true,
);

for (const fulfilmentMethod of ["pickup", "dine_in"] as const) {
  assert.deepEqual(receiptAmountPresentation(receipt({ fulfilmentMethod })), {
    amountLabel: "Total",
    deliveryFeePending: false,
    processingFeeAmount: null,
  });
}

// Payment state is not an input to the label; the receipt keeps showing the
// unchanged order amount, not an outstanding balance or recalculated payable.
const settlement = calculateOrderSettlement({
  items: [{ unitPrice: 135, quantity: 1 }],
  adjustments: [{ amount: 5 }],
  allocations: [],
  refunds: [],
});
assert.equal(settlement.amountDue, 140);
const partialSettlement = calculateOrderSettlement({
  items: [{ unitPrice: 135, quantity: 1 }],
  adjustments: [{ amount: 5 }],
  allocations: [{ amount: 40, paymentStatus: "verified" }],
  refunds: [],
});
const paidSettlement = calculateOrderSettlement({
  items: [{ unitPrice: 135, quantity: 1 }],
  adjustments: [{ amount: 5 }],
  allocations: [{ amount: 140, paymentStatus: "verified" }],
  refunds: [],
});
assert.deepEqual(
  [settlement.amountDue, partialSettlement.amountDue, paidSettlement.amountDue],
  [140, 140, 140],
);
assert.deepEqual(
  [
    settlement.remainingBalance,
    partialSettlement.remainingBalance,
    paidSettlement.remainingBalance,
  ],
  [140, 100, 0],
);
assert.equal(receiptAmountPresentation(receipt()).amountLabel, "Order amount");

// The downloadable customer details card uses the same label and fee state.
const pendingCard = buildOrderDetailsCardModel(receipt());
assert.equal(pendingCard.amountLabel, "Order amount");
assert.equal(pendingCard.deliveryFeePending, true);
assert.equal(
  pendingCard.deliveryFeeExplanation,
  DELIVERY_FEE_PENDING_RECEIPT_EXPLANATION,
);
assert.equal(pendingCard.total, "RM140");
assert.deepEqual(pendingCard.adjustments, [
  { label: "Processing Fee", amount: "+RM5" },
]);
const drawnText: Array<{ text: string; x: number; y: number }> = [];
let textAlign = "left";
const canvas = { width: 1080, height: 1800 };
const canvasContext = {
  canvas,
  save() {},
  restore() {},
  fillRect() {},
  fill() {},
  clip() {},
  beginPath() {},
  closePath() {},
  moveTo() {},
  lineTo() {},
  quadraticCurveTo() {},
  rect() {},
  stroke() {},
  fillText(text: string, x: number, y: number) {
    drawnText.push({ text, x, y });
  },
  measureText(text: string) {
    return { width: text.length * 8 };
  },
  font: "",
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  letterSpacing: "0px",
  get textAlign() {
    return textAlign;
  },
  set textAlign(value: string) {
    textAlign = value;
  },
  textBaseline: "alphabetic",
};
drawOrderDetailsCard(
  canvasContext as unknown as CanvasRenderingContext2D,
  pendingCard,
);
assert.equal(canvas.height, 1800);
const drawnReceipt = drawnText.map((entry) => entry.text).join("\n");
assert.match(drawnReceipt, /ORDER AMOUNT/);
assert.match(drawnReceipt, /Delivery fee/);
assert.match(drawnReceipt, /To be confirmed/);
assert.match(drawnReceipt, /final payable amount will be confirmed/);
assert.ok(drawnText.every((entry) => entry.y > 0 && entry.y < 1800));
assert.ok(
  drawnText.some((entry) =>
    entry.text.includes("Please keep this for your reference"),
  ),
);
assert.equal(
  buildOrderDetailsCardModel(
    receipt({ deliveryFeeStatus: "quoted", deliveryFeeQuotedAmount: 12 }),
  ).amountLabel,
  "Total",
);
assert.equal(
  calculateOrderSettlement({
    items: [{ unitPrice: 135, quantity: 1 }],
    adjustments: [{ amount: 5 }, { amount: 12 }],
    allocations: [],
    refunds: [],
  }).amountDue,
  152,
);
assert.equal(
  buildOrderDetailsCardModel(receipt({ fulfilmentMethod: "pickup" }))
    .amountLabel,
  "Total",
);
assert.equal(
  buildOrderDetailsCardModel(receipt({ fulfilmentMethod: "dine_in" }))
    .deliveryFeePending,
  false,
);

// Existing paid add-ons and complimentary quantities remain presentation data;
// neither enters the amount formula except paid add-ons' existing line prices.
const extras = receipt({
  isFreshPick: true,
  paidAddons: [
    { key: "addon", name: "Paid Add-on", quantity: 1, unitPrice: 3 },
  ],
  complimentaryItems: [{ key: "candle", name: "Candle", quantity: 2 }],
});
const extrasCard = buildOrderDetailsCardModel(extras);
assert.equal(extrasCard.addons[0]?.price, "RM3");
assert.equal(extrasCard.complimentary[0]?.meta, "× 2 · Complimentary");
assert.equal(extrasCard.total, "RM140");

const receiptSource = readSource(
  "src/workspaces/storefront/checkout/receipt.ts",
);
const recapSource = readSource(
  "src/workspaces/storefront/checkout/SuccessReceiptRecap.tsx",
);
const cardSource = readSource(
  "src/workspaces/storefront/checkout/order-details-card.ts",
);
const checkoutSummarySource = readSource(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);
const confirmSource = readSource(
  "src/workspaces/storefront/checkout/CheckoutConfirmPrompt.tsx",
);
assert.match(
  receiptSource,
  /order_delivery_details \( delivery_fee_status, delivery_fee_quoted_amount \)/,
);
assert.match(
  receiptSource,
  /effectiveReceiptProcessingFeeAmount\(adjustments\)/,
);
assert.match(recapSource, /receiptAmountPresentation\(receipt\)/);
assert.match(recapSource, /formatRm\(receipt\.total\)/);
assert.match(recapSource, /Delivery fee/);
assert.match(recapSource, /To be confirmed/);
assert.match(cardSource, /model\.amountLabel\.toUpperCase\(\)/);
assert.match(cardSource, /model\.deliveryFeePending/);
assert.match(checkoutSummarySource, /TOTAL_BEFORE_DELIVERY_FEE_LABEL/);
assert.match(confirmSource, /TOTAL_BEFORE_DELIVERY_FEE_LABEL/);
assert.doesNotMatch(checkoutSummarySource, /receiptAmountPresentation/);

console.log(
  "PASS: Delivery receipt wording states; totals and checkout contracts unchanged.",
);
