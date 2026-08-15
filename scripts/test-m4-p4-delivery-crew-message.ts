/**
 * M4-P4 — Delivery Crew Order Message.
 * Run: npx tsx scripts/test-m4-p4-delivery-crew-message.ts
 *
 * Snapshot/helper suite only (no live DB fixtures). No migration.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildConfirmationPayload,
  CONFIRMATION_SECTION_SEPARATOR,
  DELIVERY_FEE_WAIVED_CONFIRMATION_LINE,
  formatConfirmationFinancialBlock,
  generateConfirmationMessage,
  PROCESSING_FEE_WAIVED_CONFIRMATION_LINE,
} from "@/engines/orders/confirmation-message";
import {
  MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_TITLE,
} from "@/engines/orders/confirmation-validity";
import {
  DELIVERY_FEE_CODE,
  DELIVERY_FEE_WAIVED_LINE,
  DELIVERY_PROCESSING_FEE_CODE,
  formatDeliveryFinanceWaiverLines,
  PROCESSING_FEE_WAIVED_LINE,
} from "@/engines/orders/delivery-finance";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import {
  equationAdjustmentShorthand,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import {
  defaultDeliveryFinanceDtoFields,
  isCrewOrderMessageAvailable,
  isPickupCrewMessageAvailable,
  pickupCrewUnavailableReason,
} from "@/engines/orders/fulfilment";
import { messageActionsForOperationalState } from "@/engines/orders/message-availability";
import {
  CREW_NOTIFY_DO_NOT_INFORM,
  CREW_NOTIFY_INFORM,
  formatCrewDeliveryAddress,
  formatCrewDeliveryOrderHeader,
  formatCrewPaymentLine,
  generateCrewOrderMessage,
  generateOrderMessage,
} from "@/engines/orders/messages";
import { customerFacingAdjustmentLabel } from "@/engines/orders/payment-message";
import type {
  OrderAdjustment,
  StorefrontOrder,
  StorefrontOrderDelivery,
} from "@/types/storefront";

const processingAdj: OrderAdjustment = {
  id: "adj-p",
  orderId: "o1",
  kind: "surcharge",
  code: DELIVERY_PROCESSING_FEE_CODE,
  label: "Delivery Processing Fee",
  amount: 5,
  reason: null,
  metadata: {},
  status: "active",
  reversesAdjustmentId: null,
  createdAt: "2026-08-12T00:00:00.000Z",
};

const deliveryAdj: OrderAdjustment = {
  id: "adj-d",
  orderId: "o1",
  kind: "surcharge",
  code: DELIVERY_FEE_CODE,
  label: "Delivery Fee",
  amount: 15,
  reason: null,
  metadata: {},
  status: "active",
  reversesAdjustmentId: null,
  createdAt: "2026-08-12T00:00:00.000Z",
};

function deliveryDetails(
  overrides: Partial<StorefrontOrderDelivery> = {},
): StorefrontOrderDelivery {
  return {
    recipientName: "Mum",
    recipientPhone: "0198888888",
    addressLine1: "12 Jalan Delivery",
    addressLine2: null,
    postcode: "88400",
    city: "Kota Kinabalu",
    state: "Sabah",
    recipientNotifyPreference: "inform_recipient",
    ...defaultDeliveryFinanceDtoFields(),
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted",
    deliveryFeeQuotedAmount: 15,
    ...overrides,
  };
}

function storefrontOrder(overrides: Partial<StorefrontOrder> = {}): StorefrontOrder {
  return {
    id: "o1",
    orderNumber: "WOS-1",
    status: "awaiting_payment",
    customerName: "Amy",
    phone: "0123456789",
    email: null,
    pickupDate: "2026-08-15",
    pickupTime: "13:00:00",
    pickupInstruction: null,
    customerNotes: null,
    internalNotes: null,
    orderSource: "whatsapp",
    crewOrder: false,
    includeReceipt: false,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    confirmationNeedsResend: false,
    fulfilmentMethod: "delivery",
    delivery: deliveryDetails(),
    readyAt: null,
    pickedUpAt: null,
    items: [
      {
        id: "i1",
        cakeId: "c1",
        cakeSizeId: "s1",
        cakeName: "Red Dates",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 125,
      },
    ],
    complimentaryItems: [],
    paidAddons: [],
    adjustments: [processingAdj, deliveryAdj],
    paymentAllocations: [],
    settlement: {
      subtotal: 125,
      amountDue: 145,
      netReceived: 0,
      remainingBalance: 145,
      overpayment: 0,
    },
    ...overrides,
  } as StorefrontOrder;
}

// ---------------------------------------------------------------------------
// Gating + availability
// ---------------------------------------------------------------------------
assert.equal(isPickupCrewMessageAvailable("pickup"), true);
assert.equal(isPickupCrewMessageAvailable("delivery"), false);
assert.equal(isCrewOrderMessageAvailable("pickup"), true);
assert.equal(isCrewOrderMessageAvailable("delivery"), true);
assert.equal(isCrewOrderMessageAvailable(null), true);
assert.equal(pickupCrewUnavailableReason("delivery"), null);

const notReadyDelivery = messageActionsForOperationalState({
  readyAt: null,
  pickedUpAt: null,
  fulfilmentMethod: "delivery",
});
assert.equal(notReadyDelivery.some((a) => a.type === "crew"), true);
assert.equal(notReadyDelivery.some((a) => a.type === "customer_ready"), false);

const readyDelivery = messageActionsForOperationalState({
  readyAt: "2026-08-15T02:00:00.000Z",
  pickedUpAt: null,
  fulfilmentMethod: "delivery",
});
assert.equal(readyDelivery.some((a) => a.type === "crew"), true);
assert.equal(readyDelivery.some((a) => a.type === "customer_ready"), false);

assert.doesNotThrow(() => generateCrewOrderMessage(storefrontOrder()));
assert.doesNotThrow(() =>
  generateOrderMessage("crew", { order: storefrontOrder() }),
);

// ---------------------------------------------------------------------------
// Header + identity + address + time + notify
// ---------------------------------------------------------------------------
assert.equal(
  formatCrewDeliveryOrderHeader({ pickupDate: "2026-08-15", unpaid: true }),
  "🔺🟢🚗 Delivery Order: 15/8 (Sat)",
);
assert.equal(
  formatCrewDeliveryOrderHeader({ pickupDate: "2026-08-15", unpaid: false }),
  "🟢🚗 Delivery Order: 15/8 (Sat)",
);
assert.equal(
  formatCrewDeliveryAddress(deliveryDetails()),
  "12 Jalan Delivery, 88400 Kota Kinabalu, Sabah",
);
assert.equal(
  formatCrewDeliveryAddress(
    deliveryDetails({ addressLine2: "Unit 5", postcode: "88100" }),
  ),
  "12 Jalan Delivery, Unit 5, 88100 Kota Kinabalu, Sabah",
);

const unpaidDifferent = generateCrewOrderMessage(storefrontOrder());
assert.ok(unpaidDifferent.startsWith("🔺🟢🚗 Delivery Order: 15/8 (Sat)"));
assert.ok(unpaidDifferent.includes("Ordered by: Amy (w)"));
assert.ok(unpaidDifferent.includes("Phone No: 0123456789"));
assert.ok(unpaidDifferent.includes("Recipient: Mum"));
assert.ok(unpaidDifferent.includes("Recipient Phone No: 0198888888"));
assert.ok(
  unpaidDifferent.includes(
    "Address: 12 Jalan Delivery, 88400 Kota Kinabalu, Sabah",
  ),
);
assert.ok(unpaidDifferent.includes("Time: 1pm"));
assert.ok(!unpaidDifferent.includes("1:00 PM"));
assert.ok(unpaidDifferent.includes("Time: 1pm\n\nWhole Cake;"));
assert.ok(unpaidDifferent.includes('~ Red Dates 6"x1'));
assert.ok(unpaidDifferent.includes(CREW_NOTIFY_INFORM));
assert.ok(!unpaidDifferent.includes(CREW_NOTIFY_DO_NOT_INFORM));
assert.ok(!unpaidDifferent.includes("Pick-up order:"));
assert.ok(!unpaidDifferent.includes("🟠"));

const surprise = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      recipientNotifyPreference: "do_not_inform_recipient",
    }),
  }),
);
assert.ok(surprise.includes(CREW_NOTIFY_DO_NOT_INFORM));
assert.ok(!surprise.includes(CREW_NOTIFY_INFORM));
assert.ok(!surprise.includes("*DO NOT inform Recipient"));

const samePerson = generateCrewOrderMessage(
  storefrontOrder({
    customerName: "delivery",
    phone: "0121111111",
    orderSource: "customer_website",
    delivery: deliveryDetails({
      recipientName: "delivery",
      recipientPhone: "0121111111",
      addressLine1: "taman 23",
      postcode: "88100",
    }),
  }),
);
assert.ok(samePerson.includes("Ordered by/ Recipient: delivery"));
assert.ok(samePerson.includes("Phone No: 0121111111"));
assert.ok(samePerson.includes("Address: taman 23, 88100 Kota Kinabalu, Sabah"));
assert.ok(!samePerson.includes("\nRecipient:"));
assert.ok(!samePerson.includes("Recipient Phone No:"));
assert.ok(!samePerson.includes(CREW_NOTIFY_INFORM));
assert.ok(!samePerson.includes(CREW_NOTIFY_DO_NOT_INFORM));
assert.ok(samePerson.includes("Kota Kinabalu"));
assert.ok(samePerson.includes("Sabah"));

const missingDetails = generateCrewOrderMessage(
  storefrontOrder({ delivery: null }),
);
assert.ok(missingDetails.startsWith("🔺🟢🚗 Delivery Order:"));
assert.ok(missingDetails.includes("Ordered by: Amy (w)"));
assert.ok(!missingDetails.includes("Address:"));
assert.ok(!missingDetails.includes(CREW_NOTIFY_INFORM));
assert.ok(!missingDetails.includes("Pick-up order:"));

// ---------------------------------------------------------------------------
// Equation: pf/df, row order, NOT SET, waiver, RM0 skip
// ---------------------------------------------------------------------------
assert.equal(equationAdjustmentShorthand(processingAdj), "Processing");
assert.equal(equationAdjustmentShorthand(deliveryAdj), "Delivery");
assert.equal(equationAdjustmentShorthand(processingAdj, "crew"), "pf");
assert.equal(equationAdjustmentShorthand(deliveryAdj, "crew"), "df");

assert.equal(
  formatOrderFinancialEquation({
    items: [{ unitPrice: 125, quantity: 1 }],
    effective: [processingAdj, deliveryAdj],
    amountDue: 145,
  }),
  "RM125+RM5(Processing)+RM15(Delivery)= RM145",
);
assert.equal(
  formatOrderFinancialEquation({
    items: [{ unitPrice: 125, quantity: 1 }],
    effective: [processingAdj, deliveryAdj],
    amountDue: 145,
    audience: "crew",
  }),
  "RM125+RM5(pf)+RM15(df)= RM145",
);
assert.equal(
  formatOrderFinancialEquation({
    items: [{ unitPrice: 125, quantity: 1 }],
    effective: [deliveryAdj, processingAdj],
    amountDue: 145,
    audience: "crew",
  }),
  "RM125+RM15(df)+RM5(pf)= RM145",
);

assert.ok(unpaidDifferent.includes("RM125+RM5(pf)+RM15(df)= RM145 (NYP)"));
assert.ok(!unpaidDifferent.includes("(Processing)"));
assert.ok(!unpaidDifferent.includes("(Delivery)"));
assert.ok(!unpaidDifferent.includes(PROCESSING_FEE_WAIVED_LINE));
assert.ok(!unpaidDifferent.includes(DELIVERY_FEE_WAIVED_LINE));
assert.ok(!unpaidDifferent.includes("Order Total:"));

assert.equal(PROCESSING_FEE_WAIVED_LINE, PROCESSING_FEE_WAIVED_CONFIRMATION_LINE);
assert.equal(DELIVERY_FEE_WAIVED_LINE, DELIVERY_FEE_WAIVED_CONFIRMATION_LINE);
assert.equal(
  formatDeliveryFinanceWaiverLines({ fulfilmentMethod: "pickup", delivery: null }),
  null,
);
assert.equal(
  formatDeliveryFinanceWaiverLines({
    fulfilmentMethod: "delivery",
    delivery: deliveryDetails({
      processingFeeWaived: true,
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
  }),
  `${PROCESSING_FEE_WAIVED_LINE}\n${DELIVERY_FEE_WAIVED_LINE}`,
);

const notSetCrew = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      deliveryFeeStatus: "not_set",
      deliveryFeeQuotedAmount: null,
    }),
    adjustments: [processingAdj],
    settlement: {
      subtotal: 125,
      amountDue: 130,
      netReceived: 0,
      remainingBalance: 130,
      overpayment: 0,
    },
  }),
);
assert.ok(notSetCrew.includes("RM125+RM5(pf)= RM130 (NYP)"));
assert.ok(!notSetCrew.includes("(df)"));
assert.ok(!notSetCrew.includes(DELIVERY_FEE_WAIVED_LINE));
assert.ok(!notSetCrew.includes(PROCESSING_FEE_WAIVED_LINE));
assert.ok(!notSetCrew.includes(MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_TITLE));

const waivedDeliveryCrew = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
    adjustments: [processingAdj],
    settlement: {
      subtotal: 125,
      amountDue: 130,
      netReceived: 0,
      remainingBalance: 130,
      overpayment: 0,
    },
  }),
);
assert.ok(
  waivedDeliveryCrew.includes(
    `RM125+RM5(pf)= RM130 (NYP)\n${DELIVERY_FEE_WAIVED_LINE}`,
  ),
);
assert.ok(!waivedDeliveryCrew.includes("(df)"));
assert.ok(!waivedDeliveryCrew.includes(PROCESSING_FEE_WAIVED_LINE));

const waivedProcessingCrew = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      processingFeeWaived: true,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
    adjustments: [deliveryAdj],
    settlement: {
      subtotal: 125,
      amountDue: 140,
      netReceived: 0,
      remainingBalance: 140,
      overpayment: 0,
    },
  }),
);
assert.ok(
  waivedProcessingCrew.includes(
    `RM125+RM15(df)= RM140 (NYP)\n${PROCESSING_FEE_WAIVED_LINE}`,
  ),
);
assert.ok(!waivedProcessingCrew.includes("(pf)"));
assert.ok(!waivedProcessingCrew.includes(DELIVERY_FEE_WAIVED_LINE));

const bothWaivedCrew = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      processingFeeWaived: true,
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
    adjustments: [],
    complimentaryItems: [
      {
        id: "c1",
        name: "Birthday Topper",
        quantity: 1,
        sortOrder: 1,
        complimentaryItemTypeId: null,
      },
    ],
    settlement: {
      subtotal: 125,
      amountDue: 125,
      netReceived: 0,
      remainingBalance: 125,
      overpayment: 0,
    },
  }),
);
assert.ok(
  bothWaivedCrew.includes(
    `RM125 (NYP)\n${PROCESSING_FEE_WAIVED_LINE}\n${DELIVERY_FEE_WAIVED_LINE}\n\n*Complimentary Birthday Topper x1`,
  ),
);
assert.ok(!bothWaivedCrew.includes("(pf)"));
assert.ok(!bothWaivedCrew.includes("(df)"));

const noncanonicalRm0Processing = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      processingFeeApplicableAmount: 0,
      processingFeeWaived: false,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
    adjustments: [{ ...processingAdj, amount: 0 }, deliveryAdj],
    settlement: {
      subtotal: 125,
      amountDue: 140,
      netReceived: 0,
      remainingBalance: 140,
      overpayment: 0,
    },
  }),
);
assert.ok(noncanonicalRm0Processing.includes("RM125+RM15(df)= RM140 (NYP)"));
assert.ok(!noncanonicalRm0Processing.includes(PROCESSING_FEE_WAIVED_LINE));
assert.ok(!noncanonicalRm0Processing.includes("(pf)"));

const noncanonicalDeliveryFlag = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      deliveryFeeStatus: "not_set",
      deliveryFeeQuotedAmount: null,
      deliveryFeeWaived: true,
    }),
    adjustments: [processingAdj],
    settlement: {
      subtotal: 125,
      amountDue: 130,
      netReceived: 0,
      remainingBalance: 130,
      overpayment: 0,
    },
  }),
);
assert.ok(noncanonicalDeliveryFlag.includes("RM125+RM5(pf)= RM130 (NYP)"));
assert.ok(!noncanonicalDeliveryFlag.includes(DELIVERY_FEE_WAIVED_LINE));
assert.ok(!noncanonicalDeliveryFlag.includes("(df)"));

const financeDisabledWaivedFlags = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      financeEnabled: false,
      processingFeeWaived: true,
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
    adjustments: [],
    settlement: {
      subtotal: 125,
      amountDue: 125,
      netReceived: 0,
      remainingBalance: 125,
      overpayment: 0,
    },
  }),
);
assert.ok(financeDisabledWaivedFlags.includes("RM125 (NYP)"));
assert.ok(!financeDisabledWaivedFlags.includes(PROCESSING_FEE_WAIVED_LINE));
assert.ok(!financeDisabledWaivedFlags.includes(DELIVERY_FEE_WAIVED_LINE));

const restoredQuotedCrew = generateCrewOrderMessage(
  storefrontOrder({
    delivery: deliveryDetails({
      processingFeeWaived: false,
      processingFeeOverrideAmount: 3,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: false,
    }),
    adjustments: [{ ...processingAdj, amount: 3 }, deliveryAdj],
    settlement: {
      subtotal: 125,
      amountDue: 143,
      netReceived: 0,
      remainingBalance: 143,
      overpayment: 0,
    },
  }),
);
assert.ok(restoredQuotedCrew.includes("RM125+RM3(pf)+RM15(df)= RM143 (NYP)"));
assert.ok(!restoredQuotedCrew.includes(PROCESSING_FEE_WAIVED_LINE));
assert.ok(!restoredQuotedCrew.includes(DELIVERY_FEE_WAIVED_LINE));

assert.equal(
  formatCrewPaymentLine({
    settlement: {
      subtotal: 125,
      amountDue: 130,
      netReceived: 0,
      remainingBalance: 130,
      overpayment: 0,
    } as StorefrontOrder["settlement"],
    adjustments: [{ ...processingAdj, amount: 0 }, deliveryAdj],
    allocations: [],
    pickupDate: "2026-08-15",
    items: [{ unitPrice: 125, quantity: 1 }],
  }),
  "RM125+RM15(df)= RM130 (NYP)",
);

// ---------------------------------------------------------------------------
// Add-ons, complimentary, receipt, payment suffixes, bakery attention omitted
// ---------------------------------------------------------------------------
const withExtras = generateCrewOrderMessage(
  storefrontOrder({
    includeReceipt: true,
    needsBakeryAttention: true,
    bakeryAttentionNote: "early delivery",
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
    ],
    paidAddons: [
      {
        id: "a1",
        orderId: "o1",
        paidAddonTypeId: "t1",
        code: "birthday_card",
        name: "Birthday Card",
        unitPrice: 3,
        financialShorthand: "BC",
        quantity: 1,
        writtenMessage: "Happy Birthday Mum",
        messages: [{ cardIndex: 1, writtenMessage: "Happy Birthday Mum" }],
        sortOrder: 1,
      },
    ],
    adjustments: [processingAdj, deliveryAdj],
    settlement: {
      subtotal: 128,
      amountDue: 148,
      netReceived: 0,
      remainingBalance: 148,
      overpayment: 0,
    },
  }),
);
assert.ok(withExtras.includes("Add-ons;"));
assert.ok(withExtras.includes("~ Birthday Card x1"));
assert.ok(withExtras.includes("Message: Happy Birthday Mum"));
assert.ok(withExtras.includes("RM125+RM3(BC)+RM5(pf)+RM15(df)= RM148 (NYP)"));
assert.ok(
  withExtras.includes("*Complimentary Birthday Topper x1, Candle x1"),
);
assert.ok(withExtras.includes("*Include RECEIPT"));
assert.ok(withExtras.includes(`${CREW_NOTIFY_INFORM}`));
assert.ok(!withExtras.includes("Bakery Attention"));
assert.ok(!withExtras.includes("early delivery"));
assert.ok(
  withExtras.includes("*Include RECEIPT\n*Inform Recipient before delivery"),
);

const paidCrew = generateCrewOrderMessage(
  storefrontOrder({
    status: "paid",
    paymentAllocations: [
      {
        id: "pay1",
        paymentId: "p1",
        amount: 145,
        method: "wb_qr",
        methodDescription: null,
        paidAt: "2026-08-12T10:00:00.000Z",
        paymentStatus: "verified",
      },
    ],
    settlement: {
      subtotal: 125,
      amountDue: 145,
      netReceived: 145,
      remainingBalance: 0,
      overpayment: 0,
    },
  } as Partial<StorefrontOrder>),
);
assert.ok(paidCrew.startsWith("🟢🚗 Delivery Order: 15/8 (Sat)"));
assert.ok(!paidCrew.startsWith("🔺"));
assert.ok(paidCrew.includes("RM125+RM5(pf)+RM15(df)= RM145 (WB QR 12/8, c/o 15/8)"));

const partialCrew = generateCrewOrderMessage(
  storefrontOrder({
    paymentAllocations: [
      {
        id: "pay1",
        paymentId: "p1",
        amount: 50,
        method: "wb_qr",
        methodDescription: null,
        paidAt: "2026-08-12T10:00:00.000Z",
        paymentStatus: "verified",
      },
    ],
    settlement: {
      subtotal: 125,
      amountDue: 145,
      netReceived: 50,
      remainingBalance: 95,
      overpayment: 0,
    },
  } as Partial<StorefrontOrder>),
);
assert.ok(partialCrew.startsWith("🔺🟢🚗 Delivery Order:"));
assert.ok(partialCrew.includes("RM125+RM5(pf)+RM15(df)= RM145 (RM50 WB QR 12/8; RM95 NYP)"));
assert.ok(!partialCrew.includes("c/o"));

// ---------------------------------------------------------------------------
// Must not leak Confirmation / Payment Request surfaces
// ---------------------------------------------------------------------------
assert.ok(!unpaidDifferent.includes(CONFIRMATION_SECTION_SEPARATOR));
assert.ok(!unpaidDifferent.includes("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"));
assert.ok(!unpaidDifferent.includes("Kindly review ALL the details"));
assert.ok(!unpaidDifferent.includes("Here's the order confirmation"));
assert.equal(
  customerFacingAdjustmentLabel({
    label: "Delivery Processing Fee",
    amount: 5,
    code: DELIVERY_PROCESSING_FEE_CODE,
  }),
  "Processing Fee",
);
assert.equal(
  customerFacingAdjustmentLabel({
    label: "Delivery Fee",
    amount: 15,
    code: DELIVERY_FEE_CODE,
  }),
  "Delivery Fee",
);
const confirmationPayload = buildConfirmationPayload({
  staffCustomerFacingName: "Wee",
  customerName: "Amy",
  customerPhone: "0123456789",
  pickupDate: "2026-08-15",
  pickupTime: "13:00",
  items: [
    { cakeName: "Red Dates", sizeLabel: '6"', quantity: 1, unitPrice: 125 },
  ],
  complimentaryItems: [],
  paidAddons: [],
  subtotal: 125,
  adjustments: [processingAdj, deliveryAdj],
  amountDue: 145,
  fulfilmentMethod: "delivery",
  delivery: deliveryDetails(),
});
assert.equal(
  formatConfirmationFinancialBlock(confirmationPayload),
  "RM125+RM5(Processing)+RM15(Delivery)= RM145",
);

const confirmationBody = generateConfirmationMessage(confirmationPayload);
assert.ok(confirmationBody.includes("🟠🚗 Delivery order:"));
assert.ok(confirmationBody.includes("RM125+RM5(Processing)+RM15(Delivery)= RM145"));
assert.ok(!confirmationBody.includes("(pf)"));
assert.ok(!confirmationBody.includes("(df)"));
assert.ok(!confirmationBody.includes("Kota Kinabalu"));

// ---------------------------------------------------------------------------
// Pickup Crew regression + historical fulfilment fallback
// ---------------------------------------------------------------------------
const pickupCrew = generateCrewOrderMessage(
  storefrontOrder({
    fulfilmentMethod: "pickup",
    delivery: null,
    adjustments: [],
    settlement: {
      subtotal: 125,
      amountDue: 125,
      netReceived: 0,
      remainingBalance: 125,
      overpayment: 0,
    },
  }),
);
assert.ok(pickupCrew.startsWith("🔺🟢Pick-up order: 15/8 (Sat)"));
assert.ok(!pickupCrew.includes("🚗"));
assert.ok(pickupCrew.includes("Ordered by: Amy (w)"));
assert.ok(pickupCrew.includes("Time: 1pm"));
assert.ok(pickupCrew.includes("RM125 (NYP)"));
assert.ok(!pickupCrew.includes(CREW_NOTIFY_INFORM));
assert.ok(!pickupCrew.includes(PROCESSING_FEE_WAIVED_LINE));
assert.ok(!pickupCrew.includes(DELIVERY_FEE_WAIVED_LINE));

const driveThrough = generateCrewOrderMessage(
  storefrontOrder({
    fulfilmentMethod: "drive_through",
    delivery: null,
    adjustments: [],
    settlement: {
      subtotal: 125,
      amountDue: 125,
      netReceived: 0,
      remainingBalance: 125,
      overpayment: 0,
    },
  }),
);
assert.ok(driveThrough.includes("Pick-up order:"));
assert.ok(!driveThrough.includes("Delivery Order:"));

// ---------------------------------------------------------------------------
// Authority: Confirmation prep shared with Manager (routine servicing parity)
// ---------------------------------------------------------------------------
const owner = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: "owner-1",
});
const manager = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
const counter = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co-1",
});
assert.equal(owner.canPrepareConfirmation, true);
assert.equal(manager.canPrepareConfirmation, true);
assert.equal(counter.canPrepareConfirmation, true);
assert.equal(manager.canDirectFeeExceptions, true);
assert.equal(counter.canRequestFeeExceptions, true);

// ---------------------------------------------------------------------------
// Source still documents Slice 3 Confirmation shorthands + P4 Crew pf/df
// ---------------------------------------------------------------------------
const equationSource = readFileSync(
  resolve("src/engines/orders/financial-equation.ts"),
  "utf8",
);
assert.match(equationSource, /audience === "crew" \? "pf" : "Processing"/);
assert.match(equationSource, /audience === "crew" \? "df" : "Delivery"/);
assert.equal(existsSync("src/engines/orders/messages.ts"), true);

console.log("M4-P4 Delivery Crew Message tests: PASS");
