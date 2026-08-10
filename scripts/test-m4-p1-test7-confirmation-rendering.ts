/**
 * M4-P1 Test 7 — Customer Confirmation paid-add-on + per-card message rendering.
 * Run: npx tsx scripts/test-m4-p1-test7-confirmation-rendering.ts
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
import type { StorefrontOrder } from "@/types/storefront";

const cake135 = {
  cakeName: 'Dubai Chocolate Kunafa 6" (Slightly Sweeter)',
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 135,
};

const cake125 = {
  cakeName: "Red Dates",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 125,
};

function payload(
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

const bc = (quantity: number, messages: Array<string | null>) => ({
  name: "Birthday Card",
  quantity,
  unitPrice: 3,
  financialShorthand: "BC",
  messages: messages.map((writtenMessage, i) => ({
    cardIndex: i + 1,
    writtenMessage,
  })),
});

const wc = (quantity: number, messages: Array<string | null>) => ({
  name: "Wishing Card",
  quantity,
  unitPrice: 3,
  financialShorthand: "WC",
  messages: messages.map((writtenMessage, i) => ({
    cardIndex: i + 1,
    writtenMessage,
  })),
});

// A. no add-ons → historical shape (no Special Request, no add-on lines)
{
  const body = generateConfirmationMessage(payload());
  assert.ok(body.includes("Whole Cake;\n~ Dubai Chocolate Kunafa"));
  assert.ok(!body.includes("Birthday Card"));
  assert.ok(!body.includes("Special Request"));
  assert.ok(body.includes("\nRM135\n"));
  assert.ok(
    body.includes("*Complimentary Birthday Topper x1, Candle x1, Knife x1"),
  );
}

// B. BC x1, no message
{
  const p = payload({
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
  assert.equal(formatConfirmationFinancialBlock(p), "RM135+RM3(BC)= RM138");
}

// C. BC x1 + message
{
  const p = payload({
    paidAddons: [bc(1, ["hbd"])],
    subtotal: 138,
    amountDue: 138,
  });
  const body = generateConfirmationMessage(p);
  assert.ok(body.includes("~ Birthday Card x1"));
  assert.ok(body.includes("⭐️Special Request:⭐️"));
  assert.ok(body.includes("~Written message on Birthday Card:"));
  assert.ok(!body.includes("Birthday Card 1:"));
  assert.ok(body.includes("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"));
  assert.ok(body.includes("\nhbd\n"));
  assert.ok(body.includes("RM135+RM3(BC)= RM138"));
}

// D. WC x1 + message
{
  const p = payload({
    paidAddons: [wc(1, ["Congrats"])],
    subtotal: 138,
    amountDue: 138,
  });
  const body = generateConfirmationMessage(p);
  assert.ok(body.includes("~ Wishing Card x1"));
  assert.ok(body.includes("~Written message on Wishing Card:"));
  assert.ok(body.includes("\nCongrats\n"));
}

// E. BC x2 + two independent messages
{
  const p = payload({
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

// F. BC x2 + Card 1 only
{
  const p = payload({
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

// G. BC x2 + Card 2 only
{
  const special = formatConfirmationSpecialRequestBlock([
    bc(2, [null, "Mum"]),
  ]);
  assert.ok(special?.includes("Birthday Card 2:"));
  assert.ok(!special?.includes("Birthday Card 1:"));
}

// H. BC x3 mixed blank/nonblank
{
  const special = formatConfirmationSpecialRequestBlock([
    bc(3, ["A", null, "C"]),
  ]);
  assert.ok(special?.includes("Birthday Card 1:"));
  assert.ok(!special?.includes("Birthday Card 2:"));
  assert.ok(special?.includes("Birthday Card 3:"));
  assert.equal(
    formatWrittenMessageOnCardLabel({
      addonName: "Birthday Card",
      quantity: 3,
      cardIndex: 2,
    }),
    "~Written message on Birthday Card 2:",
  );
}

// I. BC + WC both with messages
{
  const p = payload({
    paidAddons: [bc(1, ["hbd"]), wc(1, ["congrats"])],
    subtotal: 141,
    amountDue: 141,
  });
  const body = generateConfirmationMessage(p);
  assert.ok(body.includes("~ Birthday Card x1"));
  assert.ok(body.includes("~ Wishing Card x1"));
  assert.ok(body.includes("~Written message on Birthday Card:"));
  assert.ok(body.includes("~Written message on Wishing Card:"));
  assert.equal(
    formatConfirmationFinancialBlock(p),
    "RM135+RM3(BC)+RM3(WC)= RM141",
  );
}

// J. BC x2 financial equation — one commercial line
{
  const p = payload({
    items: [cake125],
    paidAddons: [bc(2, ["a", "b"])],
    subtotal: 131,
    amountDue: 131,
  });
  assert.equal(formatConfirmationFinancialBlock(p), "RM125+RM3*2(BC)= RM131");
}

// K. message-only edit invalidates
{
  const before = {
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
    paidAddons: [
      {
        id: "a1",
        orderId: "o1",
        paidAddonTypeId: "t",
        code: "birthday_card",
        name: "Birthday Card",
        unitPrice: 3,
        financialShorthand: "BC",
        quantity: 1,
        writtenMessage: null,
        messages: [{ cardIndex: 1, writtenMessage: "Amy" }],
        sortOrder: 0,
      },
    ],
  } as unknown as StorefrontOrder;

  assert.equal(
    orderMateriallyAffectsConfirmation(before, {
      customerName: "Amy",
      phone: "012",
      pickupDate: "2026-08-15",
      pickupTime: "14:00",
      items: before.items,
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
  assert.equal(
    shouldOutdateSentConfirmation({
      materialChange: true,
      orderStatus: "awaiting_payment",
    }),
    true,
  );
}

// L. Awaiting Payment preserved after mark updated confirmation sent
{
  assert.equal(
    nextStatusAfterConfirmationMarkedSent("awaiting_payment"),
    "awaiting_payment",
  );
}

// Snapshot payload carries per-card messages
{
  const order = {
    customerName: "jworder",
    phone: "0100000000",
    pickupDate: "2026-08-22",
    pickupTime: "16:30",
    items: [
      {
        cakeId: "c1",
        cakeSizeId: "s1",
        quantity: 1,
        unitPrice: 135,
        cakeName: cake135.cakeName,
        sizeLabel: cake135.sizeLabel,
      },
    ],
    complimentaryItems: [],
    paidAddons: [
      {
        id: "a1",
        orderId: "o1",
        paidAddonTypeId: "t",
        code: "birthday_card",
        name: "Birthday Card",
        unitPrice: 3,
        financialShorthand: "BC",
        quantity: 1,
        writtenMessage: null,
        messages: [{ cardIndex: 1, writtenMessage: "hbd" }],
        sortOrder: 0,
      },
    ],
    adjustments: [],
    settlement: { subtotal: 138, amountDue: 138 },
  } as unknown as StorefrontOrder;

  const snap = buildConfirmationPayloadFromOrder({
    order,
    staffCustomerFacingName: "Owner (Dev)",
  });
  assert.equal(snap.paidAddons?.[0]?.messages?.[0]?.writtenMessage, "hbd");
  const body = generateConfirmationMessage(snap);
  assert.ok(body.includes("\nhbd\n"));
  assert.ok(body.includes("~ Birthday Card x1"));
}

// Product target fragment ordering: commercial → special → equation
{
  const body = generateConfirmationMessage(
    payload({
      paidAddons: [bc(1, ["hbd"])],
      subtotal: 138,
      amountDue: 138,
    }),
  );
  const wholeIdx = body.indexOf("Whole Cake;");
  const cardIdx = body.indexOf("~ Birthday Card x1");
  const specialIdx = body.indexOf("⭐️Special Request:⭐️");
  const eqIdx = body.indexOf("RM135+RM3(BC)= RM138");
  assert.ok(wholeIdx < cardIdx && cardIdx < specialIdx && specialIdx < eqIdx);
}

console.log("M4-P1 Test 7 confirmation-rendering tests: PASSED");
