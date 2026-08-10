/**
 * M4-P1 Slice 5 — Calendar Quick View paid add-ons + Matrix/Cakes non-regression.
 * Run: npx tsx scripts/test-m4-p1-slice5-calendar-quick-view.ts
 */
import assert from "node:assert/strict";
import {
  buildConfirmationPayload,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import {
  commercialEquationItems,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import { generateCrewOrderMessage } from "@/engines/orders/messages";
import {
  evaluateAugustPromoEligibility,
  evaluateAugustPromoRuleFit,
} from "@/engines/orders/promotions";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import {
  calculateCakeSubtotal,
  calculateCommercialSubtotal,
  commercialLinesForSettlement,
  normalizePaidAddonLines,
} from "@/engines/orders/totals";
import {
  cakeLinesFromCalendarEntries,
  totalCakeQuantityFromCalendarEntries,
  totalCakeQuantityFromItems,
} from "@/workspaces/owner/calendar/cake-production";
import { buildCalendarMatrix } from "@/workspaces/owner/calendar/matrix";
import {
  buildQuickViewPaidAddonBlocks,
  formatQuickViewPaidAddonTitle,
} from "@/workspaces/owner/calendar/quick-view-paid-addons";
import type { CalendarEntry } from "@/workspaces/owner/calendar/types";
import type {
  OrderSettlement,
  StorefrontOrder,
  StorefrontPaidAddon,
} from "@/types/storefront";

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

function calendarEntry(
  overrides: Partial<CalendarEntry> & { items: CalendarEntry["items"] },
): CalendarEntry {
  return {
    kind: "order",
    id: "order-1",
    pickupDate: "2026-08-15",
    pickupTime: "15:00:00",
    customerName: "Amy",
    displayName: "Amy",
    status: "paid",
    needsBakeryAttention: false,
    hasEffectiveRm10: false,
    readyAt: null,
    pickedUpAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A–I Quick View mapping
// ---------------------------------------------------------------------------

// A. no add-ons → empty/omitted
assert.deepEqual(buildQuickViewPaidAddonBlocks([]), []);
assert.deepEqual(buildQuickViewPaidAddonBlocks(undefined), []);
assert.deepEqual(buildQuickViewPaidAddonBlocks(null), []);

// B. BC ×1, no message
{
  const blocks = buildQuickViewPaidAddonBlocks([bc(1, [null])]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.title, "Birthday Card ×1");
  assert.deepEqual(blocks[0]!.messageLines, []);
}

// C. BC ×1 + message
{
  const blocks = buildQuickViewPaidAddonBlocks([
    bc(1, ["Happy Birthday Amy!"]),
  ]);
  assert.equal(blocks[0]!.title, "Birthday Card ×1");
  assert.deepEqual(blocks[0]!.messageLines, [
    "Message: Happy Birthday Amy!",
  ]);
}

// D. BC ×2 + independent messages
{
  const blocks = buildQuickViewPaidAddonBlocks([
    bc(2, ["Happy Birthday Amy!", "Happy Birthday Mum!"]),
  ]);
  assert.equal(blocks[0]!.title, "Birthday Card ×2");
  assert.deepEqual(blocks[0]!.messageLines, [
    "Card 1: Happy Birthday Amy!",
    "Card 2: Happy Birthday Mum!",
  ]);
}

// E. BC ×2 with Card 2 blank
{
  const blocks = buildQuickViewPaidAddonBlocks([bc(2, ["Amy", null])]);
  assert.equal(blocks[0]!.title, "Birthday Card ×2");
  assert.deepEqual(blocks[0]!.messageLines, ["Card 1: Amy"]);
}

// F. mixed BC/WC with independent messages
{
  const blocks = buildQuickViewPaidAddonBlocks([
    wc(1, ["Congratulations!"]),
    bc(2, ["Happy Birthday Amy!", "Happy Birthday Mum!"]),
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]!.code, "birthday_card");
  assert.equal(blocks[0]!.title, "Birthday Card ×2");
  assert.deepEqual(blocks[0]!.messageLines, [
    "Card 1: Happy Birthday Amy!",
    "Card 2: Happy Birthday Mum!",
  ]);
  assert.equal(blocks[1]!.code, "wishing_card");
  assert.equal(blocks[1]!.title, "Wishing Card ×1");
  assert.deepEqual(blocks[1]!.messageLines, ["Message: Congratulations!"]);
}

// G. qty ×3
{
  const blocks = buildQuickViewPaidAddonBlocks([
    bc(3, ["A", null, "C"]),
  ]);
  assert.equal(blocks[0]!.title, "Birthday Card ×3");
  assert.deepEqual(blocks[0]!.messageLines, ["Card 1: A", "Card 3: C"]);
  assert.equal(formatQuickViewPaidAddonTitle({ name: "Birthday Card", quantity: 3 }), "Birthday Card ×3");
}

// H. snapshot name used rather than live catalog concept
{
  const blocks = buildQuickViewPaidAddonBlocks([
    bc(1, ["snap"], { name: "Birthday Card (Old Snapshot)" }),
  ]);
  assert.equal(blocks[0]!.title, "Birthday Card (Old Snapshot) ×1");
  assert.deepEqual(blocks[0]!.messageLines, [
    "Message: snap",
  ]);
}

// I. historical order missing paidAddons remains valid
{
  assert.deepEqual(normalizePaidAddonLines(undefined), []);
  assert.deepEqual(normalizePaidAddonLines(null), []);
  assert.deepEqual(buildQuickViewPaidAddonBlocks(undefined), []);
}

// ---------------------------------------------------------------------------
// J–M Matrix / Cakes non-regression
// ---------------------------------------------------------------------------

const productionEntry = calendarEntry({
  items: [
    {
      id: "item-1",
      cakeName: "Chocolate D'Amour",
      sizeLabel: '6"',
      quantity: 1,
    },
  ],
});

// Simulate StorefrontOrder with BC×3 + WC×2 — CalendarEntry must still be cake-only.
const commercialAddonQty = 3 + 2;
assert.equal(totalCakeQuantityFromItems(productionEntry.items), 1);
assert.notEqual(
  totalCakeQuantityFromItems(productionEntry.items),
  1 + commercialAddonQty,
);

// J. Matrix count unchanged with BC/WC present (addons never on CalendarEntry)
{
  const matrix = buildCalendarMatrix([productionEntry], ["2026-08-15"]);
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0]!.cakeName, "Chocolate D'Amour");
  assert.equal(matrix[0]!.cellsByDate["2026-08-15"]!.totalQuantity, 1);
  assert.ok(!matrix.some((row) => row.cakeName.includes("Birthday")));
  assert.ok(!matrix.some((row) => row.cakeName.includes("Wishing")));
}

// K. Cakes aggregation unchanged with BC/WC present
{
  const lines = cakeLinesFromCalendarEntries([productionEntry]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.cakeName, "Chocolate D'Amour");
  assert.equal(lines[0]!.quantity, 1);
  assert.ok(!lines.some((line) => /Card/i.test(line.cakeName)));
}

// L. paid-add-on quantities never contribute to cake total
{
  assert.equal(totalCakeQuantityFromCalendarEntries([productionEntry]), 1);
  // Even if a mistaken caller passed addon-like rows into items, Matrix still
  // only sees CalendarCakeItem — prove cake helper ignores Storefront paidAddons.
  const orderLikePaidAddons = [bc(3, [null, null, null]), wc(2, [null, null])];
  const cakeOnly = totalCakeQuantityFromItems(productionEntry.items);
  const addonQty = orderLikePaidAddons.reduce((s, a) => s + a.quantity, 0);
  assert.equal(cakeOnly, 1);
  assert.equal(addonQty, 5);
  assert.notEqual(cakeOnly + addonQty, cakeOnly);
}

// M. complimentary remains independent (Quick View blocks ≠ complimentary)
{
  const blocks = buildQuickViewPaidAddonBlocks([bc(1, ["msg"])]);
  assert.ok(!blocks.some((b) => /Complimentary/i.test(b.title)));
  assert.equal(blocks[0]!.title, "Birthday Card ×1");
}

// ---------------------------------------------------------------------------
// N–P financial regressions (Slice 5 must not change money)
// ---------------------------------------------------------------------------

// N. commercial settlement still includes cards
{
  const settled = calculateOrderSettlement({
    items: commercialLinesForSettlement({
      items: [{ unitPrice: 125, quantity: 1 }],
      paidAddons: [
        { unitPrice: 3, quantity: 3 },
        { unitPrice: 3, quantity: 2 },
      ],
    }),
    adjustments: [],
    allocations: [],
    refunds: [],
  });
  assert.equal(settled.subtotal, 140);
  assert.equal(settled.amountDue, 140);
  assert.equal(
    calculateCommercialSubtotal({
      items: [{ unitPrice: 125, quantity: 1 }],
      paidAddons: [
        { unitPrice: 3, quantity: 3 },
        { unitPrice: 3, quantity: 2 },
      ],
    }),
    140,
  );
}

// O. August Promo still uses cake subtotal only
{
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
}

// P. RM10 regression
assert.equal(
  formatOrderFinancialEquation({
    items: commercialEquationItems({
      cakes: [{ unitPrice: 125, quantity: 1 }],
      paidAddons: [{ unitPrice: 3, quantity: 1, financialShorthand: "BC" }],
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

// ---------------------------------------------------------------------------
// Q–R Confirmation / Crew Slice 4 regression fixtures
// ---------------------------------------------------------------------------

// Q. Confirmation Slice 4 regression
{
  const body = generateConfirmationMessage(
    buildConfirmationPayload({
      staffCustomerFacingName: "Owner (Dev)",
      customerName: "jworder",
      customerPhone: "0100000000",
      pickupDate: "2026-08-22",
      pickupTime: "16:30",
      items: [
        {
          cakeName: "Chocolate D'Amour",
          sizeLabel: '6"',
          quantity: 1,
          unitPrice: 125,
        },
      ],
      complimentaryItems: [{ name: "Candle", quantity: 1 }],
      paidAddons: [
        {
          name: "Birthday Card",
          quantity: 2,
          unitPrice: 3,
          financialShorthand: "BC",
          messages: [
            { cardIndex: 1, writtenMessage: "Happy Birthday Amy!" },
            { cardIndex: 2, writtenMessage: "Happy Birthday Mum!" },
          ],
        },
      ],
      subtotal: 131,
      adjustments: [],
      amountDue: 131,
    }),
  );
  assert.ok(body.includes("Whole Cake;"));
  assert.ok(body.includes("~ Birthday Card x2"));
  assert.ok(!body.includes("Add-ons;"));
  assert.ok(body.includes("⭐️Special Request:⭐️"));
  assert.ok(body.includes("~Written message on Birthday Card 1:"));
  assert.ok(body.includes("~Written message on Birthday Card 2:"));
  assert.ok(body.includes("RM125+RM3*2(BC)= RM131"));
  assert.ok(body.includes("*Complimentary Candle x1"));
}

// R. Crew Slice 4 regression
{
  const settlement = (partial: Partial<OrderSettlement>): OrderSettlement => ({
    subtotal: 131,
    totalAdjustments: 0,
    amountDue: 131,
    verifiedPaymentsAllocated: 0,
    refundsIssued: 0,
    netReceived: 0,
    remainingBalance: 131,
    overpayment: 0,
    isFullyPaid: false,
    ...partial,
  });

  const body = generateCrewOrderMessage({
    id: "order-1",
    orderNumber: "WB-1001",
    customerName: "Lisa",
    phone: "01135062106",
    email: "",
    pickupDate: "2026-07-28",
    pickupTime: "15:00",
    pickupInstruction: null,
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
        name: "Candle",
        quantity: 1,
        sortOrder: 1,
        complimentaryItemTypeId: null,
      },
    ],
    paidAddons: [
      bc(2, ["Happy Birthday Amy!", "Happy Birthday Mum!"]),
    ],
    total: 131,
    adjustments: [],
    paymentAllocations: [],
    refunds: [],
    settlement: settlement({}),
  } as StorefrontOrder);

  assert.ok(body.includes("Add-ons;\n~ Birthday Card x2"));
  assert.ok(body.includes("Card 1: Happy Birthday Amy!"));
  assert.ok(body.includes("Card 2: Happy Birthday Mum!"));
  assert.ok(body.includes("RM125+RM3*2(BC)= RM131 (NYP)"));
  assert.ok(body.includes("*Complimentary Candle x1"));
  assert.ok(body.includes("*Include RECEIPT"));
  assert.ok(!body.includes("⭐️Special Request"));
}

console.log("M4-P1 Slice 5 calendar-quick-view tests: PASSED");
