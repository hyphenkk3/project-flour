/**
 * M4-P1 Slice 4 — Customer Confirmation completion + Crew Add-ons + financial/lifecycle.
 * Run: npx tsx scripts/test-m4-p1-slice4-confirmation-crew.ts
 */
import assert from "node:assert/strict";
import {
  buildConfirmationPayload,
  buildConfirmationPayloadFromOrder,
  formatConfirmationCommercialLines,
  formatConfirmationFinancialBlock,
  formatConfirmationSpecialRequestBlock,
  formatWrittenMessageOnCardLabel,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import {
  nextStatusAfterConfirmationMarkedSent,
  orderMateriallyAffectsConfirmation,
  shouldOutdateSentConfirmation,
} from "@/engines/orders/confirmation-validity";
import {
  commercialEquationItems,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import {
  formatCrewAddonsBlock,
  formatCrewPaidAddonMessageLines,
  generateCrewOrderMessage,
} from "@/engines/orders/messages";
import {
  evaluateAugustPromoEligibility,
  evaluateAugustPromoRuleFit,
} from "@/engines/orders/promotions";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import {
  calculateCakeSubtotal,
  commercialLinesForSettlement,
} from "@/engines/orders/totals";
import type {
  OrderSettlement,
  StorefrontOrder,
  StorefrontPaidAddon,
} from "@/types/storefront";

const cake125 = {
  cakeName: "Chocolate D'Amour",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 125,
};

const cake135 = {
  cakeName: 'Dubai Chocolate Kunafa 6" (Slightly Sweeter)',
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 135,
};

function bc(
  quantity: number,
  messages: Array<string | null>,
  extras: Partial<StorefrontPaidAddon> = {},
): StorefrontPaidAddon {
  return {
    id: "bc-1",
    orderId: "o1",
    paidAddonTypeId: "t-bc",
    code: "birthday_card",
    name: "Birthday Card",
    unitPrice: 3,
    financialShorthand: "BC",
    quantity,
    writtenMessage: null,
    messages: messages.map((writtenMessage, i) => ({
      cardIndex: i + 1,
      writtenMessage,
    })),
    sortOrder: 10,
    ...extras,
  };
}

function wc(
  quantity: number,
  messages: Array<string | null>,
  extras: Partial<StorefrontPaidAddon> = {},
): StorefrontPaidAddon {
  return {
    id: "wc-1",
    orderId: "o1",
    paidAddonTypeId: "t-wc",
    code: "wishing_card",
    name: "Wishing Card",
    unitPrice: 3,
    financialShorthand: "WC",
    quantity,
    writtenMessage: null,
    messages: messages.map((writtenMessage, i) => ({
      cardIndex: i + 1,
      writtenMessage,
    })),
    sortOrder: 20,
    ...extras,
  };
}

function confirmationPayload(
  overrides: Partial<Parameters<typeof buildConfirmationPayload>[0]> = {},
) {
  return buildConfirmationPayload({
    staffCustomerFacingName: "Owner (Dev)",
    customerName: "jworder",
    customerPhone: "0100000000",
    pickupDate: "2026-08-22",
    pickupTime: "16:30",
    items: [cake135],
    complimentaryItems: [
      { name: "Birthday Topper", quantity: 1 },
      { name: "Candle", quantity: 1 },
      { name: "Knife", quantity: 1 },
    ],
    subtotal: 135,
    adjustments: [],
    amountDue: 135,
    ...overrides,
  });
}

function settlement(partial: Partial<OrderSettlement>): OrderSettlement {
  return {
    subtotal: 135,
    totalAdjustments: 0,
    amountDue: 135,
    verifiedPaymentsAllocated: 0,
    refundsIssued: 0,
    netReceived: 0,
    remainingBalance: 135,
    overpayment: 0,
    isFullyPaid: false,
    ...partial,
  };
}

function crewOrder(
  overrides: Partial<StorefrontOrder> = {},
): StorefrontOrder {
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
    status: "awaiting_payment",
    createdAt: "2026-07-20T00:00:00.000Z",
    confirmationNeedsResend: false,
    collectionId: null,
    orderSource: "whatsapp",
    crewOrder: true,
    includeReceipt: true,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    readyAt: null,
    readyBy: null,
    pickedUpAt: null,
    pickedUpBy: null,
    outForDeliveryAt: null,
    outForDeliveryBy: null,
    deliveredAt: null,
    deliveredBy: null,
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
        unitPrice: 125,
        cakeName: "Chocolate D'Amour",
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
    ],
    paidAddons: [],
    total: 125,
    adjustments: [],
    paymentAllocations: [],
    refunds: [],
    settlement: settlement({
      subtotal: 125,
      amountDue: 125,
      remainingBalance: 125,
    }),
    ...overrides,
  } as StorefrontOrder;
}

// ---------------------------------------------------------------------------
// CUSTOMER CONFIRMATION A–K
// ---------------------------------------------------------------------------

// A. no add-ons => historical output unchanged
{
  const body = generateConfirmationMessage(confirmationPayload());
  assert.ok(body.includes("Whole Cake;\n~ Dubai Chocolate Kunafa"));
  assert.ok(!body.includes("Birthday Card"));
  assert.ok(!body.includes("Wishing Card"));
  assert.ok(!body.includes("Add-ons;"));
  assert.ok(!body.includes("Special Request"));
  assert.ok(body.includes("\nRM135\n"));
  assert.ok(
    body.includes("*Complimentary Birthday Topper x1, Candle x1, Knife x1"),
  );
}

// B. BC x1 no message
{
  const p = confirmationPayload({
    paidAddons: [bc(1, [null])],
    subtotal: 138,
    amountDue: 138,
  });
  const body = generateConfirmationMessage(p);
  assert.equal(
    formatConfirmationCommercialLines(p),
    `~ Dubai Chocolate Kunafa 6" (Slightly Sweeter) 6" x1\n~ Birthday Card x1`,
  );
  assert.equal(formatConfirmationSpecialRequestBlock(p.paidAddons), null);
  assert.ok(!body.includes("Special Request"));
  assert.ok(!body.includes("Add-ons;"));
  assert.equal(formatConfirmationFinancialBlock(p), "RM135+RM3(BC)= RM138");
}

// C. BC x1 with message
{
  const p = confirmationPayload({
    paidAddons: [bc(1, ["Happy Birthday Amy!"])],
    subtotal: 138,
    amountDue: 138,
  });
  const body = generateConfirmationMessage(p);
  assert.ok(body.includes("~ Birthday Card x1"));
  assert.ok(body.includes("⭐️Special Request:⭐️"));
  assert.ok(body.includes("~Written message on Birthday Card:"));
  assert.ok(!body.includes("Birthday Card 1:"));
  assert.ok(body.includes("Happy Birthday Amy!"));
  assert.ok(body.includes("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"));
}

// D. BC x2 with two different messages
{
  const p = confirmationPayload({
    items: [cake125],
    paidAddons: [bc(2, ["Happy Birthday Amy!", "Happy Birthday Mum!"])],
    subtotal: 131,
    amountDue: 131,
  });
  const body = generateConfirmationMessage(p);
  assert.ok(body.includes("~ Birthday Card x2"));
  assert.ok(body.includes("~Written message on Birthday Card 1:"));
  assert.ok(body.includes("~Written message on Birthday Card 2:"));
  assert.ok(body.includes("Happy Birthday Amy!"));
  assert.ok(body.includes("Happy Birthday Mum!"));
}

// E. BC x2 where Card 2 blank
{
  const p = confirmationPayload({
    paidAddons: [bc(2, ["Amy", null])],
    subtotal: 141,
    amountDue: 141,
  });
  const special = formatConfirmationSpecialRequestBlock(p.paidAddons);
  assert.ok(special?.includes("Birthday Card 1:"));
  assert.ok(!special?.includes("Birthday Card 2:"));
  assert.ok(
    formatConfirmationCommercialLines(p).includes("~ Birthday Card x2"),
  );
}

// F. BC + WC mixed messages
{
  const p = confirmationPayload({
    paidAddons: [bc(1, ["hbd"]), wc(1, ["congrats"])],
    subtotal: 141,
    amountDue: 141,
  });
  const body = generateConfirmationMessage(p);
  const bcLine = body.indexOf("~ Birthday Card x1");
  const wcLine = body.indexOf("~ Wishing Card x1");
  const bcMsg = body.indexOf("~Written message on Birthday Card:");
  const wcMsg = body.indexOf("~Written message on Wishing Card:");
  assert.ok(bcLine < wcLine);
  assert.ok(bcMsg < wcMsg);
  assert.equal(
    formatConfirmationFinancialBlock(p),
    "RM135+RM3(BC)+RM3(WC)= RM141",
  );
}

// G. qty 3 message labels
{
  assert.equal(
    formatWrittenMessageOnCardLabel({
      addonName: "Birthday Card",
      quantity: 3,
      cardIndex: 3,
    }),
    "~Written message on Birthday Card 3:",
  );
  const special = formatConfirmationSpecialRequestBlock([
    bc(3, ["A", null, "C"]),
  ]);
  assert.ok(special?.includes("Birthday Card 1:"));
  assert.ok(!special?.includes("Birthday Card 2:"));
  assert.ok(special?.includes("Birthday Card 3:"));
}

// H. equation placement after Special Request
{
  const body = generateConfirmationMessage(
    confirmationPayload({
      paidAddons: [bc(1, ["hbd"])],
      subtotal: 138,
      amountDue: 138,
    }),
  );
  const specialIdx = body.indexOf("⭐️Special Request:⭐️");
  const eqIdx = body.indexOf("RM135+RM3(BC)= RM138");
  assert.ok(specialIdx < eqIdx);
}

// I. complimentary remains separate
{
  const body = generateConfirmationMessage(
    confirmationPayload({
      paidAddons: [bc(1, ["hbd"])],
      subtotal: 138,
      amountDue: 138,
    }),
  );
  const eqIdx = body.indexOf("RM135+RM3(BC)= RM138");
  const complimentaryIdx = body.indexOf("*Complimentary Birthday Topper");
  assert.ok(eqIdx < complimentaryIdx);
  assert.ok(
    !body
      .slice(complimentaryIdx)
      .includes("Birthday Card"),
  );
}

// J. snapshot rendering does not depend on live catalog
{
  const snap = buildConfirmationPayload({
    staffCustomerFacingName: "Owner",
    customerName: "Amy",
    customerPhone: "012",
    pickupDate: "2026-08-22",
    pickupTime: "16:30",
    items: [cake125],
    complimentaryItems: [],
    paidAddons: [
      {
        name: "Birthday Card (Snapshot Name)",
        quantity: 1,
        unitPrice: 3,
        financialShorthand: "BC",
        messages: [{ cardIndex: 1, writtenMessage: "snap msg" }],
      },
    ],
    subtotal: 128,
    adjustments: [],
    amountDue: 128,
  });
  const body = generateConfirmationMessage(snap);
  assert.ok(body.includes("~ Birthday Card (Snapshot Name) x1"));
  assert.ok(
    body.includes("~Written message on Birthday Card (Snapshot Name):"),
  );
  assert.ok(body.includes("snap msg"));
}

// K. old payload missing paidAddons => safe []
{
  const p = confirmationPayload();
  delete (p as { paidAddons?: unknown }).paidAddons;
  const body = generateConfirmationMessage(p);
  assert.equal(formatConfirmationCommercialLines(p), `~ Dubai Chocolate Kunafa 6" (Slightly Sweeter) 6" x1`);
  assert.equal(formatConfirmationSpecialRequestBlock(p.paidAddons), null);
  assert.ok(!body.includes("Birthday Card"));
  assert.ok(body.includes("\nRM135\n"));
}

// ---------------------------------------------------------------------------
// CREW L–W
// ---------------------------------------------------------------------------

const historicalNoAddonCrew = generateCrewOrderMessage(crewOrder());

// L. no add-ons => historical Crew output unchanged
{
  assert.ok(!historicalNoAddonCrew.includes("Add-ons;"));
  assert.ok(!historicalNoAddonCrew.includes("Birthday Card"));
  assert.equal(
    generateCrewOrderMessage(crewOrder({ paidAddons: [] })),
    historicalNoAddonCrew,
  );
  assert.ok(historicalNoAddonCrew.includes("Whole Cake;"));
  assert.ok(historicalNoAddonCrew.includes('~ Chocolate D\'Amour 6"x1'));
  assert.ok(historicalNoAddonCrew.includes("RM125 (NYP)"));
  assert.ok(
    historicalNoAddonCrew.includes(
      "*Complimentary Birthday Topper x1, Candle x1",
    ),
  );
  assert.ok(historicalNoAddonCrew.includes("*Include RECEIPT"));
  const paymentIdx = historicalNoAddonCrew.indexOf("RM125 (NYP)");
  const complimentaryIdx = historicalNoAddonCrew.indexOf("*Complimentary");
  const receiptIdx = historicalNoAddonCrew.indexOf("*Include RECEIPT");
  assert.ok(paymentIdx < complimentaryIdx && complimentaryIdx < receiptIdx);
}

// M. BC x1 no message
{
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(1, [null])],
      settlement: settlement({
        subtotal: 128,
        amountDue: 128,
        remainingBalance: 128,
      }),
      total: 128,
    }),
  );
  assert.ok(body.includes("Add-ons;\n~ Birthday Card x1"));
  assert.ok(!body.includes("Message:"));
  assert.ok(!body.includes("Card 1:"));
  assert.ok(body.includes("RM125+RM3(BC)= RM128 (NYP)"));
  assert.ok(!body.includes("⭐️Special Request"));
  assert.ok(!body.includes("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"));
}

// N. BC x1 with message
{
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(1, ["Happy Birthday Amy!"])],
      settlement: settlement({
        subtotal: 128,
        amountDue: 128,
        remainingBalance: 128,
      }),
    }),
  );
  assert.ok(body.includes("~ Birthday Card x1\nMessage: Happy Birthday Amy!"));
}

// O. BC x2 with independent messages
{
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(2, ["Happy Birthday Amy!", "Happy Birthday Mum!"])],
      settlement: settlement({
        subtotal: 131,
        amountDue: 131,
        remainingBalance: 131,
      }),
    }),
  );
  assert.ok(body.includes("~ Birthday Card x2"));
  assert.ok(body.includes("Card 1: Happy Birthday Amy!"));
  assert.ok(body.includes("Card 2: Happy Birthday Mum!"));
  assert.ok(!body.includes("Message:"));
}

// P. blank message omitted
{
  assert.deepEqual(
    formatCrewPaidAddonMessageLines({
      quantity: 2,
      messages: [
        { cardIndex: 1, writtenMessage: "Amy" },
        { cardIndex: 2, writtenMessage: null },
      ],
    }),
    ["Card 1: Amy"],
  );
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(2, ["Amy", null])],
      settlement: settlement({
        subtotal: 131,
        amountDue: 131,
        remainingBalance: 131,
      }),
    }),
  );
  assert.ok(body.includes("~ Birthday Card x2"));
  assert.ok(body.includes("Card 1: Amy"));
  assert.ok(!body.includes("Card 2:"));
}

// Q. BC + WC ordering
{
  const block = formatCrewAddonsBlock([
    wc(1, ["Congratulations!"]),
    bc(2, ["Happy Birthday Amy!", "Happy Birthday Mum!"]),
  ]);
  assert.equal(
    block,
    [
      "Add-ons;",
      "~ Birthday Card x2",
      "Card 1: Happy Birthday Amy!",
      "Card 2: Happy Birthday Mum!",
      "~ Wishing Card x1",
      "Message: Congratulations!",
    ].join("\n"),
  );
}

// R. qty 3 labels
{
  assert.deepEqual(
    formatCrewPaidAddonMessageLines({
      quantity: 3,
      messages: [
        { cardIndex: 1, writtenMessage: "A" },
        { cardIndex: 2, writtenMessage: null },
        { cardIndex: 3, writtenMessage: "C" },
      ],
    }),
    ["Card 1: A", "Card 3: C"],
  );
}

// S. equation includes correct shorthand/qty
{
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(2, [null, null]), wc(1, [null])],
      settlement: settlement({
        subtotal: 134,
        amountDue: 134,
        remainingBalance: 134,
      }),
    }),
  );
  assert.ok(body.includes("RM125+RM3*2(BC)+RM3(WC)= RM134 (NYP)"));
}

// T. NYP suffix preserved
{
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(1, [null])],
      settlement: settlement({
        subtotal: 128,
        amountDue: 128,
        remainingBalance: 128,
      }),
    }),
  );
  assert.ok(body.includes("(NYP)"));
  assert.ok(body.startsWith("🔺🟢Pick-up order:"));
}

// U. partial/full payment suffix behavior preserved
{
  const partial = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(1, [null])],
      paymentAllocations: [
        {
          id: "pay-1",
          orderId: "order-1",
          amount: 50,
          method: "wb_qr",
          methodDescription: null,
          paidAt: "2026-07-25T10:00:00.000Z",
          paymentStatus: "verified",
          recordedBy: null,
          note: null,
          createdAt: "2026-07-25T10:00:00.000Z",
        },
      ],
      settlement: settlement({
        subtotal: 128,
        amountDue: 128,
        verifiedPaymentsAllocated: 50,
        netReceived: 50,
        remainingBalance: 78,
        isFullyPaid: false,
      }),
    }),
  );
  assert.ok(partial.includes("RM125+RM3(BC)= RM128"));
  assert.ok(partial.includes("NYP)"));
  assert.ok(partial.includes("RM50"));

  const paid = generateCrewOrderMessage(
    crewOrder({
      status: "paid",
      paidAddons: [bc(1, [null])],
      includeReceipt: true,
      paymentAllocations: [
        {
          id: "pay-1",
          orderId: "order-1",
          amount: 128,
          method: "wb_qr",
          methodDescription: null,
          paidAt: "2026-07-25T10:00:00.000Z",
          paymentStatus: "verified",
          recordedBy: null,
          note: null,
          createdAt: "2026-07-25T10:00:00.000Z",
        },
      ],
      settlement: settlement({
        subtotal: 128,
        amountDue: 128,
        verifiedPaymentsAllocated: 128,
        netReceived: 128,
        remainingBalance: 0,
        isFullyPaid: true,
      }),
    }),
  );
  assert.ok(paid.startsWith("🟢Pick-up order:"));
  assert.ok(paid.includes("c/o 28/7"));
  assert.ok(!paid.includes("(NYP)"));
}

// V. complimentary remains separate
{
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(1, ["msg"])],
      settlement: settlement({
        subtotal: 128,
        amountDue: 128,
        remainingBalance: 128,
      }),
    }),
  );
  const addonsIdx = body.indexOf("Add-ons;");
  const eqIdx = body.indexOf("RM125+RM3(BC)= RM128 (NYP)");
  const complimentaryIdx = body.indexOf("*Complimentary");
  assert.ok(addonsIdx < eqIdx && eqIdx < complimentaryIdx);
  assert.ok(
    !body.slice(complimentaryIdx).includes("Birthday Card"),
  );
}

// W. Include RECEIPT position preserved
{
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [bc(1, [null])],
      includeReceipt: true,
      settlement: settlement({
        subtotal: 128,
        amountDue: 128,
        remainingBalance: 128,
      }),
    }),
  );
  const complimentaryIdx = body.indexOf("*Complimentary");
  const receiptIdx = body.indexOf("*Include RECEIPT");
  assert.ok(complimentaryIdx < receiptIdx);
  assert.ok(body.trimEnd().endsWith("*Include RECEIPT"));
}

// Full product example shape
{
  const body = generateCrewOrderMessage(
    crewOrder({
      paidAddons: [
        bc(2, ["Happy Birthday Amy!", "Happy Birthday Mum!"]),
        wc(1, ["Congratulations!"]),
      ],
      settlement: settlement({
        subtotal: 134,
        amountDue: 134,
        remainingBalance: 134,
      }),
    }),
  );
  assert.ok(
    body.includes(
      [
        "Whole Cake;",
        '~ Chocolate D\'Amour 6"x1',
        "",
        "Add-ons;",
        "~ Birthday Card x2",
        "Card 1: Happy Birthday Amy!",
        "Card 2: Happy Birthday Mum!",
        "~ Wishing Card x1",
        "Message: Congratulations!",
        "",
        "RM125+RM3*2(BC)+RM3(WC)= RM134 (NYP)",
      ].join("\n"),
    ),
  );
}

// ---------------------------------------------------------------------------
// FINANCIAL / PROMO X–AD
// ---------------------------------------------------------------------------

const augustBase = {
  orderSource: "customer_website" as const,
  orderDate: "2026-08-01",
  pickupDate: "2026-08-15",
  hasAugustPromo: false,
  hasRm10Card: false,
  hasVerifiedPayments: false,
  orderStatus: "submitted",
};

// X. RM99 cake + BC => August false
assert.equal(
  evaluateAugustPromoEligibility({
    ...augustBase,
    cakeSubtotal: calculateCakeSubtotal([{ unitPrice: 99, quantity: 1 }]),
  }).eligible,
  false,
);

// Y. RM100 cake + WC => August false (cards must not help)
assert.equal(
  evaluateAugustPromoEligibility({
    ...augustBase,
    cakeSubtotal: 100,
  }).eligible,
  false,
);

// Z. RM101 cake => August true
assert.equal(
  evaluateAugustPromoRuleFit({
    orderSource: "customer_website",
    orderDate: "2026-08-01",
    pickupDate: "2026-08-15",
    cakeSubtotal: 101,
  }).eligible,
  true,
);

// AA. RM125 + BC + WC + August => amountDue/equation RM111
{
  const settled = calculateOrderSettlement({
    items: commercialLinesForSettlement({
      items: [{ unitPrice: 125, quantity: 1 }],
      paidAddons: [
        { unitPrice: 3, quantity: 1 },
        { unitPrice: 3, quantity: 1 },
      ],
    }),
    adjustments: [{ amount: -20 }],
    allocations: [],
    refunds: [],
  });
  assert.equal(settled.amountDue, 111);
  assert.equal(
    formatOrderFinancialEquation({
      items: commercialEquationItems({
        cakes: [{ unitPrice: 125, quantity: 1 }],
        paidAddons: [
          { unitPrice: 3, quantity: 1, financialShorthand: "BC" },
          { unitPrice: 3, quantity: 1, financialShorthand: "WC" },
        ],
      }),
      effective: [
        {
          amount: -20,
          label: "August Promo",
          code: "august_promo_2026",
          metadata: {},
        },
      ],
      amountDue: 111,
    }),
    "RM125+RM3(BC)+RM3(WC)-RM20(AugPromo)= RM111",
  );
}

// AB. RM125 + BC + RM10 => RM118
{
  const settled = calculateOrderSettlement({
    items: commercialLinesForSettlement({
      items: [{ unitPrice: 125, quantity: 1 }],
      paidAddons: [{ unitPrice: 3, quantity: 1 }],
    }),
    adjustments: [{ amount: -10 }],
    allocations: [],
    refunds: [],
  });
  assert.equal(settled.amountDue, 118);
  assert.equal(
    formatOrderFinancialEquation({
      items: commercialEquationItems({
        cakes: [{ unitPrice: 125, quantity: 1 }],
        paidAddons: [
          { unitPrice: 3, quantity: 1, financialShorthand: "BC" },
        ],
      }),
      effective: [
        {
          amount: -10,
          label: "RM10 Discount Card",
          code: "rm10_discount_card",
          metadata: { voucher_number: "A038" },
        },
      ],
      amountDue: 118,
    }),
    "RM125+RM3(BC)-RM10(Voucher No.A038)= RM118",
  );
}

// AC. partial payment + add-on => remaining balance correct
{
  const settled = calculateOrderSettlement({
    items: commercialLinesForSettlement({
      items: [{ unitPrice: 125, quantity: 1 }],
      paidAddons: [{ unitPrice: 3, quantity: 1 }],
    }),
    adjustments: [],
    allocations: [
      {
        amount: 50,
        paymentStatus: "verified",
      },
    ],
    refunds: [],
  });
  assert.equal(settled.amountDue, 128);
  assert.equal(settled.netReceived, 50);
  assert.equal(settled.remainingBalance, 78);
}

// AD. paid + remove add-on => overpayment correct
{
  const settled = calculateOrderSettlement({
    items: commercialLinesForSettlement({
      items: [{ unitPrice: 125, quantity: 1 }],
      paidAddons: [],
    }),
    adjustments: [],
    allocations: [
      {
        amount: 128,
        paymentStatus: "verified",
      },
    ],
    refunds: [],
  });
  assert.equal(settled.amountDue, 125);
  assert.equal(settled.netReceived, 128);
  assert.equal(settled.remainingBalance, 0);
  assert.equal(settled.overpayment, 3);
  assert.equal(settled.isFullyPaid, true);
}

// ---------------------------------------------------------------------------
// CONFIRMATION LIFECYCLE AE–AH
// ---------------------------------------------------------------------------

const lifeBase = {
  customerName: "Amy",
  phone: "012",
  pickupDate: "2026-08-15",
  pickupTime: "14:00",
  items: [
    {
      cakeId: "c1",
      cakeSizeId: "s1",
      quantity: 1,
      unitPrice: 125,
      cakeName: "Cake",
      sizeLabel: '6"',
    },
  ],
  complimentaryItems: [],
  paidAddons: [] as StorefrontPaidAddon[],
} as unknown as StorefrontOrder;

const afterBc = {
  customerName: "Amy",
  phone: "012",
  pickupDate: "2026-08-15",
  pickupTime: "14:00",
  items: lifeBase.items,
  complimentaryItems: [],
  paidAddons: [
    {
      code: "birthday_card",
      quantity: 1,
      unitPrice: 3,
      name: "Birthday Card",
      financialShorthand: "BC",
      messages: [{ cardIndex: 1, writtenMessage: "Happy Birthday" }],
    },
  ],
};

// AE. awaiting_payment material add-on edit => outdated / needs resend
assert.equal(orderMateriallyAffectsConfirmation(lifeBase, afterBc), true);
assert.equal(
  shouldOutdateSentConfirmation({
    materialChange: true,
    orderStatus: "awaiting_payment",
  }),
  true,
);

// AF. paid material add-on edit => outdated / needs resend
assert.equal(
  shouldOutdateSentConfirmation({
    materialChange: true,
    orderStatus: "paid",
  }),
  true,
);

// AG. message-only edit => material even with unchanged amountDue
{
  const withMsg = {
    ...lifeBase,
    paidAddons: [bc(1, ["Amy"])],
  } as unknown as StorefrontOrder;
  assert.equal(
    orderMateriallyAffectsConfirmation(withMsg, {
      customerName: "Amy",
      phone: "012",
      pickupDate: "2026-08-15",
      pickupTime: "14:00",
      items: lifeBase.items,
      complimentaryItems: [],
      paidAddons: [
        {
          code: "birthday_card",
          quantity: 1,
          unitPrice: 3,
          name: "Birthday Card",
          financialShorthand: "BC",
          messages: [{ cardIndex: 1, writtenMessage: "Mum" }],
        },
      ],
    }),
    true,
  );
}

// AH. updated Confirmation marked sent preserves correct payment lifecycle
assert.equal(
  nextStatusAfterConfirmationMarkedSent("awaiting_payment"),
  "awaiting_payment",
);
assert.equal(nextStatusAfterConfirmationMarkedSent("paid"), "paid");
assert.equal(
  nextStatusAfterConfirmationMarkedSent("submitted"),
  "pending_confirmation",
);

// Snapshot from order carries paid-add-on commercial + messages
{
  const order = crewOrder({
    paidAddons: [bc(1, ["hbd"])],
    settlement: settlement({
      subtotal: 128,
      amountDue: 128,
      remainingBalance: 128,
    }),
  });
  const snap = buildConfirmationPayloadFromOrder({
    order,
    staffCustomerFacingName: "Owner (Dev)",
  });
  assert.equal(snap.paidAddons?.[0]?.name, "Birthday Card");
  assert.equal(snap.paidAddons?.[0]?.messages?.[0]?.writtenMessage, "hbd");
  assert.equal(snap.amountDue, 128);
}

console.log("M4-P1 Slice 4 confirmation-crew tests: PASSED");
