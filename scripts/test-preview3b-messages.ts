/**
 * Preview 3B — deterministic message formatter checks.
 * Run: node --experimental-strip-types scripts/test-preview3b-messages.ts
 */
import assert from "node:assert/strict";
import {
  CUSTOMER_THANK_YOU_MESSAGE,
  formatCrewCakeLine,
  formatCrewPaymentLine,
  formatCrewPickupTime,
  generateCrewOrderMessage,
  generateCustomerReadyMessage,
  generateCustomerThankYouMessage,
} from "@/engines/orders/messages";
import { messageActionsForOperationalState } from "@/engines/orders/message-availability";
import type {
  OrderAdjustment,
  OrderPaymentAllocationView,
  OrderSettlement,
  StorefrontOrder,
} from "@/types/storefront";

function settlement(partial: Partial<OrderSettlement>): OrderSettlement {
  return {
    subtotal: 135,
    totalAdjustments: 0,
    amountDue: 135,
    verifiedPaymentsAllocated: 0,
    refundsTotal: 0,
    netReceived: 0,
    remainingBalance: 135,
    overpayment: 0,
    isFullyPaid: false,
    ...partial,
  };
}

function allocation(
  partial: Partial<OrderPaymentAllocationView> &
    Pick<OrderPaymentAllocationView, "amount" | "method" | "paidAt">,
): OrderPaymentAllocationView {
  return {
    id: partial.id ?? "alloc-1",
    paymentId: partial.paymentId ?? "pay-1",
    orderId: "order-1",
    amount: partial.amount,
    paymentStatus: "verified",
    method: partial.method,
    methodDescription: partial.methodDescription ?? null,
    paidAt: partial.paidAt,
    referenceNote: null,
    verifiedBy: "staff-1",
    verifiedByName: "Owner",
    verifiedAt: partial.paidAt,
    createdAt: partial.paidAt,
  };
}

function baseOrder(overrides: Partial<StorefrontOrder> = {}): StorefrontOrder {
  return {
    id: "order-1",
    orderNumber: "WB-1001",
    customerName: "Lisa",
    phone: "01135062106",
    email: "",
    pickupDate: "2026-07-28",
    pickupTime: "15:00",
    pickupInstruction: "3-5:30pm",
    notes: null,
    internalNotes: null,
    status: "paid",
    createdAt: "2026-07-20T00:00:00.000Z",
    confirmationNeedsResend: false,
    collectionId: null,
    orderSource: "whatsapp",
    crewOrder: true,
    includeReceipt: false,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    readyAt: null,
    readyBy: null,
    pickedUpAt: null,
    pickedUpBy: null,
    paymentDeadlineAt: null,
    paymentRequestSentAt: null,
    rm10CardIssuanceSuppressed: false,
    rm10CardIssuanceSuppressionCode: null,
    items: [
      {
        id: "item-1",
        orderId: "order-1",
        cakeId: "cake-1",
        cakeSizeId: "size-1",
        quantity: 1,
        unitPrice: 135,
        cakeName: "Red Dates Serenade Delight",
        sizeLabel: '6"',
      },
    ],
    complimentaryItems: [
      {
        id: "c1",
        name: "Birthday Topper",
        quantity: 1,
        sortOrder: 1,
        complimentaryItemTypeId: null,
      },
      {
        id: "c2",
        name: "Candle",
        quantity: 1,
        sortOrder: 2,
        complimentaryItemTypeId: null,
      },
      {
        id: "c3",
        name: "Knife",
        quantity: 1,
        sortOrder: 3,
        complimentaryItemTypeId: null,
      },
    ],
    paidAddons: [],
    total: 135,
    adjustments: [],
    paymentAllocations: [
      allocation({
        amount: 135,
        method: "wb_qr",
        paidAt: "2026-07-25T10:00:00.000Z",
      }),
    ],
    refunds: [],
    settlement: settlement({
      amountDue: 135,
      netReceived: 135,
      remainingBalance: 0,
      verifiedPaymentsAllocated: 135,
      isFullyPaid: true,
    }),
    ...overrides,
  };
}

// --- Time (structured pickupTime only; instruction never overrides) ---
assert.equal(
  formatCrewPickupTime({ pickupTime: "15:00", pickupInstruction: null }),
  "3pm",
);
assert.equal(
  formatCrewPickupTime({ pickupTime: "14:30", pickupInstruction: null }),
  "2:30pm",
);
assert.equal(
  formatCrewPickupTime({
    pickupTime: "15:00",
    pickupInstruction: "Before 3pm",
  }),
  "3pm",
);
assert.equal(
  formatCrewPickupTime({
    pickupTime: "17:30",
    pickupInstruction: "Before 5:30pm — early if ready",
  }),
  "5:30pm",
);
assert.equal(
  formatCrewPickupTime({ pickupTime: "13:00", pickupInstruction: "" }),
  "1pm",
);
assert.equal(
  formatCrewPickupTime({ pickupTime: "15:30", pickupInstruction: null }),
  "3:30pm",
);

const crewTimeWithLegacyInstruction = generateCrewOrderMessage(
  baseOrder({
    pickupTime: "15:00",
    pickupInstruction: "Before 3pm",
  }),
);
assert.ok(crewTimeWithLegacyInstruction.includes("Time: 3pm"));
assert.ok(!crewTimeWithLegacyInstruction.includes("Time: Before 3pm"));
assert.ok(!crewTimeWithLegacyInstruction.includes("Before 3pm"));

// --- Cake ---
assert.equal(
  formatCrewCakeLine({
    cakeName: "Red Dates Serenade Delight",
    sizeLabel: '6"',
    quantity: 1,
  }),
  '~ Red Dates Serenade Delight 6"x1',
);

function lineItems(
  ...rows: Array<{ unitPrice: number; quantity?: number }>
): Array<{ unitPrice: number; quantity: number }> {
  return rows.map((row) => ({
    unitPrice: row.unitPrice,
    quantity: row.quantity ?? 1,
  }));
}

// --- Payment: unpaid / NYP (Product Test 3) ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 435,
      amountDue: 435,
      remainingBalance: 435,
      netReceived: 0,
      isFullyPaid: false,
    }),
    adjustments: [],
    allocations: [],
    pickupDate: "2026-08-14",
    items: lineItems({ unitPrice: 435 }),
  }),
  "RM435 (NYP)",
);

// --- Payment: one partial (Product Test 3 locked notation) ---
const partialLine = formatCrewPaymentLine({
  settlement: settlement({
    subtotal: 435,
    amountDue: 435,
    remainingBalance: 310,
    netReceived: 125,
    verifiedPaymentsAllocated: 125,
    isFullyPaid: false,
  }),
  adjustments: [],
  allocations: [
    allocation({
      amount: 125,
      method: "wb_qr",
      paidAt: "2026-08-07T10:00:00.000Z",
    }),
  ],
  pickupDate: "2026-08-14",
  items: lineItems({ unitPrice: 435 }),
});
assert.equal(partialLine, "RM435 (RM125 WB QR 7/8; RM310 NYP)");
assert.ok(!partialLine.includes("c/o"));
assert.ok(!partialLine.includes("Received"));
assert.ok(!partialLine.includes("Balance"));

// --- Payment: multiple partial (Product Test 3) ---
const partialMulti = formatCrewPaymentLine({
  settlement: settlement({
    subtotal: 435,
    amountDue: 435,
    remainingBalance: 285,
    netReceived: 150,
    verifiedPaymentsAllocated: 150,
    isFullyPaid: false,
  }),
  adjustments: [],
  allocations: [
    allocation({
      id: "a1",
      paymentId: "p1",
      amount: 100,
      method: "wb_qr",
      paidAt: "2026-08-07T10:00:00.000Z",
    }),
    allocation({
      id: "a2",
      paymentId: "p2",
      amount: 50,
      method: "online_transfer",
      paidAt: "2026-08-08T10:00:00.000Z",
    }),
  ],
  pickupDate: "2026-08-14",
  items: lineItems({ unitPrice: 435 }),
});
assert.equal(
  partialMulti,
  "RM435 (RM100 WB QR 7/8; RM50 Online Transfer 8/8; RM285 NYP)",
);
assert.ok(!partialMulti.includes("c/o"));

// --- Payment: fully paid single (Product Test 3) ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 435,
      amountDue: 435,
      remainingBalance: 0,
      netReceived: 435,
      verifiedPaymentsAllocated: 435,
      isFullyPaid: true,
    }),
    adjustments: [],
    allocations: [
      allocation({
        amount: 435,
        method: "wb_qr",
        paidAt: "2026-08-07T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-08-14",
    items: lineItems({ unitPrice: 435 }),
  }),
  "RM435 (WB QR 7/8, c/o 14/8)",
);

// --- Payment: fully paid multiple with allocation amounts (Product Test 3) ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 435,
      amountDue: 435,
      remainingBalance: 0,
      netReceived: 435,
      verifiedPaymentsAllocated: 435,
      isFullyPaid: true,
    }),
    adjustments: [],
    allocations: [
      allocation({
        id: "a1",
        paymentId: "p1",
        amount: 200,
        method: "wb_qr",
        paidAt: "2026-08-07T10:00:00.000Z",
      }),
      allocation({
        id: "a2",
        paymentId: "p2",
        amount: 235,
        method: "online_transfer",
        paidAt: "2026-08-08T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-08-14",
    items: lineItems({ unitPrice: 435 }),
  }),
  "RM435 (RM200 WB QR 7/8; RM235 Online Transfer 8/8, c/o 14/8)",
);

// --- Payment: multiple verified, fully paid (Product Test 1 shape) ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 290,
      amountDue: 290,
      remainingBalance: 0,
      netReceived: 290,
      verifiedPaymentsAllocated: 290,
      isFullyPaid: true,
    }),
    adjustments: [],
    allocations: [
      allocation({
        id: "a1",
        paymentId: "p1",
        amount: 200,
        method: "wb_qr",
        paidAt: "2026-08-07T10:00:00.000Z",
      }),
      allocation({
        id: "a2",
        paymentId: "p2",
        amount: 90,
        method: "online_transfer",
        paidAt: "2026-08-07T12:00:00.000Z",
      }),
    ],
    pickupDate: "2026-08-14",
    items: lineItems({ unitPrice: 290 }),
  }),
  "RM290 (RM200 WB QR 7/8; RM90 Online Transfer 7/8, c/o 14/8)",
);

// --- Payment: multiple same method/date — amounts still distinct ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 200,
      amountDue: 200,
      remainingBalance: 0,
      netReceived: 200,
      verifiedPaymentsAllocated: 200,
      isFullyPaid: true,
    }),
    adjustments: [],
    allocations: [
      allocation({
        id: "a1",
        paymentId: "p1",
        amount: 100,
        method: "wb_qr",
        paidAt: "2026-08-07T10:00:00.000Z",
      }),
      allocation({
        id: "a2",
        paymentId: "p2",
        amount: 100,
        method: "wb_qr",
        paidAt: "2026-08-07T11:00:00.000Z",
      }),
    ],
    pickupDate: "2026-08-14",
    items: lineItems({ unitPrice: 200 }),
  }),
  "RM200 (RM100 WB QR 7/8; RM100 WB QR 7/8, c/o 14/8)",
);

// --- Item equation: single ×1 no adjustment stays concise ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 135,
      amountDue: 135,
      remainingBalance: 0,
      netReceived: 135,
      verifiedPaymentsAllocated: 135,
      isFullyPaid: true,
    }),
    adjustments: [],
    allocations: [
      allocation({
        amount: 135,
        method: "wb_qr",
        paidAt: "2026-07-25T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-07-28",
    items: lineItems({ unitPrice: 135 }),
  }),
  "RM135 (WB QR 25/7, c/o 28/7)",
);

// --- Item equation: ×2 + AugPromo (Product Test 4 follow-up) ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 330,
      totalAdjustments: -20,
      amountDue: 310,
      remainingBalance: 0,
      netReceived: 310,
      verifiedPaymentsAllocated: 310,
      isFullyPaid: true,
    }),
    adjustments: [
      {
        id: "adj-1",
        orderId: "order-1",
        kind: "promotion",
        code: "august_promo_2026",
        label: "August Promo",
        amount: -20,
        reason: null,
        metadata: {},
        status: "active",
        reversesAdjustmentId: null,
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    allocations: [
      allocation({
        amount: 310,
        method: "wb_qr",
        paidAt: "2026-08-08T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-08-10",
    items: lineItems({ unitPrice: 165, quantity: 2 }),
  }),
  "RM165*2-RM20(AugPromo)= RM310 (WB QR 8/8, c/o 10/8)",
);

// --- Item equation: two different ×1 + promo ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 290,
      totalAdjustments: -20,
      amountDue: 270,
      remainingBalance: 0,
      netReceived: 270,
      verifiedPaymentsAllocated: 270,
      isFullyPaid: true,
    }),
    adjustments: [
      {
        id: "adj-1",
        orderId: "order-1",
        kind: "promotion",
        code: "august_promo_2026",
        label: "August Promo",
        amount: -20,
        reason: null,
        metadata: {},
        status: "active",
        reversesAdjustmentId: null,
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    allocations: [
      allocation({
        amount: 270,
        method: "wb_qr",
        paidAt: "2026-07-25T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-07-28",
    items: lineItems({ unitPrice: 125 }, { unitPrice: 165 }),
  }),
  "RM125+RM165-RM20(AugPromo)= RM270 (WB QR 25/7, c/o 28/7)",
);

// --- Item equation: mixed quantities ---
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 415,
      totalAdjustments: -20,
      amountDue: 395,
      remainingBalance: 0,
      netReceived: 395,
      verifiedPaymentsAllocated: 395,
      isFullyPaid: true,
    }),
    adjustments: [
      {
        id: "adj-1",
        orderId: "order-1",
        kind: "promotion",
        code: "august_promo_2026",
        label: "August Promo",
        amount: -20,
        reason: null,
        metadata: {},
        status: "active",
        reversesAdjustmentId: null,
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    allocations: [
      allocation({
        amount: 395,
        method: "wb_qr",
        paidAt: "2026-07-25T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-07-28",
    items: lineItems({ unitPrice: 125, quantity: 2 }, { unitPrice: 165 }),
  }),
  "RM125*2+RM165-RM20(AugPromo)= RM395 (WB QR 25/7, c/o 28/7)",
);

// --- Discount effective (single ×1) ---
const promo: OrderAdjustment = {
  id: "adj-1",
  orderId: "order-1",
  kind: "promotion",
  code: "august_promo_2026",
  label: "August Promo",
  amount: -20,
  reason: null,
  metadata: {},
  status: "active",
  reversesAdjustmentId: null,
  createdAt: "2026-07-20T00:00:00.000Z",
};
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 135,
      totalAdjustments: -20,
      amountDue: 115,
      remainingBalance: 0,
      netReceived: 115,
      verifiedPaymentsAllocated: 115,
      isFullyPaid: true,
    }),
    adjustments: [promo],
    allocations: [
      allocation({
        amount: 115,
        method: "wb_qr",
        paidAt: "2026-07-25T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-07-28",
    items: lineItems({ unitPrice: 135 }),
  }),
  "RM135-RM20(AugPromo)= RM115 (WB QR 25/7, c/o 28/7)",
);

// --- Reversed adjustment excluded ---
const reversed: OrderAdjustment = {
  ...promo,
  id: "adj-1",
  status: "reversed",
};
const reversal: OrderAdjustment = {
  id: "adj-2",
  orderId: "order-1",
  kind: "reversal",
  code: "august_promo_2026",
  label: "Reverse August Promo",
  amount: 20,
  reason: null,
  metadata: {},
  status: "active",
  reversesAdjustmentId: "adj-1",
  createdAt: "2026-07-21T00:00:00.000Z",
};
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 135,
      totalAdjustments: 0,
      amountDue: 135,
      remainingBalance: 0,
      netReceived: 135,
      verifiedPaymentsAllocated: 135,
      isFullyPaid: true,
    }),
    adjustments: [reversed, reversal],
    allocations: [
      allocation({
        amount: 135,
        method: "wb_qr",
        paidAt: "2026-07-25T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-07-28",
    items: lineItems({ unitPrice: 135 }),
  }),
  "RM135 (WB QR 25/7, c/o 28/7)",
);

// --- RM10 effective (actual voucher number from metadata) ---
const rm10: OrderAdjustment = {
  id: "adj-rm10",
  orderId: "order-1",
  kind: "voucher",
  code: "rm10_physical_card",
  label: "RM10 Discount Card",
  amount: -10,
  reason: null,
  metadata: { voucher_number: "A038" },
  status: "active",
  reversesAdjustmentId: null,
  createdAt: "2026-07-20T00:00:00.000Z",
};

// RM10 unpaid
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 125,
      totalAdjustments: -10,
      amountDue: 115,
      remainingBalance: 115,
      netReceived: 0,
      verifiedPaymentsAllocated: 0,
      isFullyPaid: false,
    }),
    adjustments: [rm10],
    allocations: [],
    pickupDate: "2026-08-10",
    items: lineItems({ unitPrice: 125 }),
  }),
  "RM125-RM10(Voucher No.A038)= RM115 (NYP)",
);

// RM10 partial
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 125,
      totalAdjustments: -10,
      amountDue: 115,
      remainingBalance: 65,
      netReceived: 50,
      verifiedPaymentsAllocated: 50,
      isFullyPaid: false,
    }),
    adjustments: [rm10],
    allocations: [
      allocation({
        amount: 50,
        method: "wb_qr",
        paidAt: "2026-08-07T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-08-10",
    items: lineItems({ unitPrice: 125 }),
  }),
  "RM125-RM10(Voucher No.A038)= RM115 (RM50 WB QR 7/8; RM65 NYP)",
);

// RM10 fully paid single
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 125,
      totalAdjustments: -10,
      amountDue: 115,
      remainingBalance: 0,
      netReceived: 115,
      verifiedPaymentsAllocated: 115,
      isFullyPaid: true,
    }),
    adjustments: [rm10],
    allocations: [
      allocation({
        amount: 115,
        method: "wb_qr",
        paidAt: "2026-08-08T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-08-10",
    items: lineItems({ unitPrice: 125 }),
  }),
  "RM125-RM10(Voucher No.A038)= RM115 (WB QR 8/8, c/o 10/8)",
);

// RM10 fully paid multi
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 125,
      totalAdjustments: -10,
      amountDue: 115,
      remainingBalance: 0,
      netReceived: 115,
      verifiedPaymentsAllocated: 115,
      isFullyPaid: true,
    }),
    adjustments: [rm10],
    allocations: [
      allocation({
        id: "a1",
        amount: 50,
        method: "wb_qr",
        paidAt: "2026-08-07T10:00:00.000Z",
      }),
      allocation({
        id: "a2",
        amount: 65,
        method: "online_transfer",
        paidAt: "2026-08-08T10:00:00.000Z",
      }),
    ],
    pickupDate: "2026-08-10",
    items: lineItems({ unitPrice: 125 }),
  }),
  "RM125-RM10(Voucher No.A038)= RM115 (RM50 WB QR 7/8; RM65 Online Transfer 8/8, c/o 10/8)",
);

const rm10Line = formatCrewPaymentLine({
  settlement: settlement({
    subtotal: 135,
    totalAdjustments: -10,
    amountDue: 125,
    remainingBalance: 0,
    netReceived: 125,
    verifiedPaymentsAllocated: 125,
    isFullyPaid: true,
  }),
  adjustments: [rm10],
  allocations: [
    allocation({
      amount: 125,
      method: "wb_qr",
      paidAt: "2026-07-25T10:00:00.000Z",
    }),
  ],
  pickupDate: "2026-07-28",
  items: lineItems({ unitPrice: 135 }),
});
assert.equal(
  rm10Line,
  "RM135-RM10(Voucher No.A038)= RM125 (WB QR 25/7, c/o 28/7)",
);
assert.ok(!rm10Line.includes("xxx"));
assert.ok(!rm10Line.includes("(RM10)"));
assert.ok(rm10Line.includes("Voucher No.A038"));

// Reversed RM10 excluded from equation
const rm10ReversedRow: OrderAdjustment = {
  ...rm10,
  id: "adj-rm10-rev",
  status: "reversed",
};
const rm10Reversal: OrderAdjustment = {
  id: "adj-rm10-reversal",
  orderId: "order-1",
  kind: "reversal",
  code: "rm10_physical_card",
  label: "Reverse RM10 Discount Card",
  amount: 10,
  reason: null,
  metadata: {},
  status: "active",
  reversesAdjustmentId: "adj-rm10-rev",
  createdAt: "2026-07-21T00:00:00.000Z",
};
assert.equal(
  formatCrewPaymentLine({
    settlement: settlement({
      subtotal: 125,
      totalAdjustments: 0,
      amountDue: 125,
      remainingBalance: 125,
      netReceived: 0,
      verifiedPaymentsAllocated: 0,
      isFullyPaid: false,
    }),
    adjustments: [rm10ReversedRow, rm10Reversal],
    allocations: [],
    pickupDate: "2026-08-10",
    items: lineItems({ unitPrice: 125 }),
  }),
  "RM125 (NYP)",
);

// --- Full paid crew message shape ---
const paidCrew = generateCrewOrderMessage(baseOrder());
assert.ok(paidCrew.startsWith("🟢Pick-up order: 28/7 (Tue)"));
assert.ok(!paidCrew.startsWith("🔺"));
assert.ok(paidCrew.includes("Ordered by: Lisa (crew)"));
assert.ok(paidCrew.includes("Phone No: 01135062106"));
assert.ok(paidCrew.includes("Time: 3pm"));
assert.ok(!paidCrew.includes("Time: 3-5:30pm"));
assert.ok(!paidCrew.includes("3-5:30pm"));
assert.ok(paidCrew.includes("Whole Cake;"));
assert.ok(paidCrew.includes('~ Red Dates Serenade Delight 6"x1'));
assert.ok(paidCrew.includes("RM135 (WB QR 25/7, c/o 28/7)"));
assert.ok(
  paidCrew.includes("*Complimentary Birthday Topper x1, Candle x1, Knife x1"),
);

// --- Unpaid crew ---
const unpaidCrew = generateCrewOrderMessage(
  baseOrder({
    status: "awaiting_payment",
    paymentAllocations: [],
    settlement: settlement({
      amountDue: 135,
      remainingBalance: 135,
      netReceived: 0,
      isFullyPaid: false,
    }),
  }),
);
assert.ok(unpaidCrew.startsWith("🔺🟢Pick-up order: 28/7 (Tue)"));
assert.ok(unpaidCrew.includes("RM135 (NYP)"));
assert.ok(!unpaidCrew.includes("c/o"));

// --- Partial crew header 🔺 + new payment notation ---
const partialCrew = generateCrewOrderMessage(
  baseOrder({
    status: "awaiting_payment",
    pickupDate: "2026-08-14",
    paymentAllocations: [
      allocation({
        amount: 125,
        method: "wb_qr",
        paidAt: "2026-08-07T10:00:00.000Z",
      }),
    ],
    settlement: settlement({
      subtotal: 435,
      amountDue: 435,
      remainingBalance: 310,
      netReceived: 125,
      verifiedPaymentsAllocated: 125,
      isFullyPaid: false,
    }),
  }),
);
assert.ok(partialCrew.startsWith("🔺🟢Pick-up order:"));
assert.ok(partialCrew.includes("RM435 (RM125 WB QR 7/8; RM310 NYP)"));
assert.ok(!partialCrew.includes("c/o"));
assert.ok(!partialCrew.includes("Received"));

// --- Include receipt ---
const withReceipt = generateCrewOrderMessage(
  baseOrder({ includeReceipt: true }),
);
assert.ok(withReceipt.includes("*Include RECEIPT"));

// --- Bakery Attention omitted from Crew message (feature remains elsewhere) ---
const withBakeryAttention = generateCrewOrderMessage(
  baseOrder({
    needsBakeryAttention: true,
    bakeryAttentionNote: "early pickup",
  }),
);
assert.ok(!withBakeryAttention.includes("Bakery Attention"));
assert.ok(!withBakeryAttention.includes("early pickup"));
assert.ok(
  withBakeryAttention.includes(
    "*Complimentary Birthday Topper x1, Candle x1, Knife x1",
  ),
);

// --- Ready sender ---
assert.ok(
  generateCustomerReadyMessage("Vivian").startsWith(
    "Good morning, Vivian here ☀️",
  ),
);
assert.ok(generateCustomerReadyMessage("Vivian").includes("Wed :3:00pm"));
assert.ok(
  !generateCustomerReadyMessage("Vivian").includes("Lisa"),
);

// --- Thank you exact ---
assert.equal(generateCustomerThankYouMessage(), CUSTOMER_THANK_YOU_MESSAGE);
assert.ok(
  CUSTOMER_THANK_YOU_MESSAGE.includes(
    "so we can improve and serve you better !",
  ),
);

// --- Availability / priority ---
assert.deepEqual(
  messageActionsForOperationalState({ readyAt: null, pickedUpAt: null }).map(
    (a) => a.type,
  ),
  ["crew"],
);

const readyActions = messageActionsForOperationalState({
  readyAt: "2026-07-28T01:00:00.000Z",
  pickedUpAt: null,
});
assert.deepEqual(
  readyActions.map((a) => a.type),
  ["crew", "customer_ready"],
);
assert.equal(
  readyActions.find((a) => a.type === "customer_ready")?.primary,
  true,
);

const pickedUpActions = messageActionsForOperationalState({
  readyAt: "2026-07-28T01:00:00.000Z",
  pickedUpAt: "2026-07-28T08:00:00.000Z",
});
assert.deepEqual(
  pickedUpActions.map((a) => a.type),
  ["crew", "customer_thank_you", "customer_ready"],
);
assert.equal(
  pickedUpActions.find((a) => a.type === "customer_thank_you")?.primary,
  true,
);
assert.equal(
  pickedUpActions.find((a) => a.type === "customer_ready")?.primary,
  false,
);

console.log("Preview 3B message formatter tests: PASSED");
