/**
 * M4-P1 Slice 3 — Owner paid-add-on draft/payload + per-card messages + materiality.
 * Run: npx tsx scripts/test-m4-p1-slice3-paid-addons.ts
 */
import assert from "node:assert/strict";
import { orderMateriallyAffectsConfirmation } from "@/engines/orders/confirmation-validity";
import {
  buildEditablePaidAddonDrafts,
  clampPaidAddonQuantity,
  messagesForQuantity,
  normalizeWrittenMessage,
  paidAddonDraftsToMutationPayload,
  paidAddonsMateriallyDiffer,
  resizeWrittenMessages,
} from "@/engines/orders/paid-addons";
import {
  calculateCommercialSubtotal,
  calculatePaidAddonSubtotal,
} from "@/engines/orders/totals";
import { evaluateAugustPromoEligibility } from "@/engines/orders/promotions";
import {
  commercialEquationItems,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import type { PaidAddonType, StorefrontOrder } from "@/types/storefront";

const catalog: PaidAddonType[] = [
  {
    id: "t-bc",
    code: "birthday_card",
    name: "Birthday Card",
    unitPrice: 3,
    financialShorthand: "BC",
    isActive: true,
    sortOrder: 10,
    maxQuantity: 3,
  },
  {
    id: "t-wc",
    code: "wishing_card",
    name: "Wishing Card",
    unitPrice: 3,
    financialShorthand: "WC",
    isActive: true,
    sortOrder: 20,
    maxQuantity: 3,
  },
];

// A. Draft / payload — per-card messages + max qty
{
  const drafts = buildEditablePaidAddonDrafts({ catalog });
  assert.equal(drafts.every((d) => !d.selected), true);
  assert.deepEqual(paidAddonDraftsToMutationPayload(drafts), []);

  const withBc = drafts.map((d) =>
    d.code === "birthday_card"
      ? {
          ...d,
          selected: true,
          quantity: 1,
          writtenMessages: [""],
        }
      : d,
  );
  assert.deepEqual(paidAddonDraftsToMutationPayload(withBc), [
    { code: "birthday_card", quantity: 1, messages: [null] },
  ]);

  const bc2 = withBc.map((d) =>
    d.code === "birthday_card"
      ? {
          ...d,
          quantity: 2,
          writtenMessages: ["Happy Birthday Amy!", "Happy Birthday Mum!"],
        }
      : d,
  );
  assert.deepEqual(paidAddonDraftsToMutationPayload(bc2), [
    {
      code: "birthday_card",
      quantity: 2,
      messages: ["Happy Birthday Amy!", "Happy Birthday Mum!"],
    },
  ]);

  const bc3 = bc2.map((d) =>
    d.code === "birthday_card"
      ? {
          ...d,
          quantity: 3,
          writtenMessages: resizeWrittenMessages(d.writtenMessages, 3).map(
            (m, i) => (i === 2 ? "Card 3" : m),
          ),
        }
      : d,
  );
  assert.equal(paidAddonDraftsToMutationPayload(bc3)[0]?.messages.length, 3);

  // UI clamp — qty 4 becomes 3
  assert.equal(clampPaidAddonQuantity(4, 3), 3);
  assert.equal(clampPaidAddonQuantity(0, 3), 1);
  const bc4clamped = bc3.map((d) =>
    d.code === "birthday_card"
      ? {
          ...d,
          quantity: clampPaidAddonQuantity(4, d.maxQuantity),
          writtenMessages: resizeWrittenMessages(d.writtenMessages, 3),
        }
      : d,
  );
  assert.equal(paidAddonDraftsToMutationPayload(bc4clamped)[0]?.quantity, 3);

  const both = bc2.map((d) =>
    d.code === "wishing_card"
      ? {
          ...d,
          selected: true,
          quantity: 1,
          writtenMessages: ["  Congrats  "],
        }
      : d,
  );
  assert.deepEqual(paidAddonDraftsToMutationPayload(both), [
    {
      code: "birthday_card",
      quantity: 2,
      messages: ["Happy Birthday Amy!", "Happy Birthday Mum!"],
    },
    { code: "wishing_card", quantity: 1, messages: ["Congrats"] },
  ]);

  assert.equal(normalizeWrittenMessage("   "), null);
  assert.equal(normalizeWrittenMessage(null), null);
  assert.equal(normalizeWrittenMessage("Hi"), "Hi");
}

// Quantity up/down message behavior (no resurrection)
{
  let slots = resizeWrittenMessages(["Amy"], 1);
  assert.deepEqual(slots, ["Amy"]);

  slots = resizeWrittenMessages(slots, 2);
  assert.deepEqual(slots, ["Amy", ""]);

  slots = resizeWrittenMessages(["Amy", "Mum"], 3);
  assert.deepEqual(slots, ["Amy", "Mum", ""]);

  slots = resizeWrittenMessages(["Amy", "Mum", "Dad"], 2);
  assert.deepEqual(slots, ["Amy", "Mum"]);

  slots = resizeWrittenMessages(slots, 1);
  assert.deepEqual(slots, ["Amy"]);

  // Reduce then increase — Card 2 does not resurrect
  slots = resizeWrittenMessages(["Amy", "Mum"], 1);
  slots = resizeWrittenMessages(slots, 2);
  assert.deepEqual(slots, ["Amy", ""]);
}

// messagesForQuantity pads / indexes correctly
{
  assert.deepEqual(
    messagesForQuantity(
      [
        { cardIndex: 1, writtenMessage: "A" },
        { cardIndex: 2, writtenMessage: null },
      ],
      2,
    ),
    ["A", ""],
  );
  assert.deepEqual(messagesForQuantity(null, 2, "Legacy"), ["Legacy", ""]);
}

// Inactive historical line remains visible
{
  const drafts = buildEditablePaidAddonDrafts({
    catalog: catalog.map((row) =>
      row.code === "birthday_card" ? { ...row, isActive: false } : row,
    ),
    existing: [
      {
        id: "line-1",
        orderId: "o1",
        paidAddonTypeId: "t-bc",
        code: "birthday_card",
        name: "Birthday Card",
        unitPrice: 3,
        financialShorthand: "BC",
        quantity: 2,
        writtenMessage: null,
        messages: [
          { cardIndex: 1, writtenMessage: "Amy" },
          { cardIndex: 2, writtenMessage: "Mum" },
        ],
        sortOrder: 10,
      },
    ],
  });
  const bc = drafts.find((d) => d.code === "birthday_card");
  assert.ok(bc);
  assert.equal(bc.selected, true);
  assert.deepEqual(bc.writtenMessages, ["Amy", "Mum"]);
}

// B. Confirmation materiality — per-card message changes
{
  assert.equal(paidAddonsMateriallyDiffer([], []), false);
  assert.equal(
    paidAddonsMateriallyDiffer(
      [],
      [
        {
          code: "birthday_card",
          quantity: 1,
          unitPrice: 3,
          name: "Birthday Card",
          financialShorthand: "BC",
          messages: [{ cardIndex: 1, writtenMessage: null }],
        },
      ],
    ),
    true,
  );

  const bc1 = {
    code: "birthday_card",
    quantity: 1,
    unitPrice: 3,
    name: "Birthday Card",
    financialShorthand: "BC",
    messages: [{ cardIndex: 1, writtenMessage: "A" }],
  };
  assert.equal(
    paidAddonsMateriallyDiffer([bc1], [
      {
        ...bc1,
        messages: [{ cardIndex: 1, writtenMessage: "B" }],
      },
    ]),
    true,
  );
  assert.equal(
    paidAddonsMateriallyDiffer(
      [
        {
          code: "birthday_card",
          quantity: 2,
          unitPrice: 3,
          messages: [
            { cardIndex: 1, writtenMessage: "Amy" },
            { cardIndex: 2, writtenMessage: "Mum" },
          ],
        },
      ],
      [
        {
          code: "birthday_card",
          quantity: 2,
          unitPrice: 3,
          messages: [
            { cardIndex: 1, writtenMessage: "Amy" },
            { cardIndex: 2, writtenMessage: "Dad" },
          ],
        },
      ],
    ),
    true,
  );
  assert.equal(
    paidAddonsMateriallyDiffer(
      [
        {
          code: "birthday_card",
          quantity: 1,
          unitPrice: 3,
          messages: [{ cardIndex: 1, writtenMessage: null }],
        },
      ],
      [
        {
          code: "birthday_card",
          quantity: 1,
          unitPrice: 3,
          messages: [{ cardIndex: 1, writtenMessage: "   " }],
        },
      ],
    ),
    false,
  );
  assert.equal(
    paidAddonsMateriallyDiffer(
      [
        {
          code: "birthday_card",
          quantity: 2,
          unitPrice: 3,
          messages: [
            { cardIndex: 1, writtenMessage: "Amy" },
            { cardIndex: 2, writtenMessage: "Mum" },
          ],
        },
      ],
      [
        {
          code: "birthday_card",
          quantity: 1,
          unitPrice: 3,
          messages: [{ cardIndex: 1, writtenMessage: "Amy" }],
        },
      ],
    ),
    true,
  );
}

// orderMateriallyAffectsConfirmation — Card 2 message-only is material
{
  const baseOrder = {
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
        sizeLabel: "6\"",
      },
    ],
    complimentaryItems: [],
    paidAddons: [
      {
        id: "a1",
        orderId: "o1",
        paidAddonTypeId: "t-bc",
        code: "birthday_card",
        name: "Birthday Card",
        unitPrice: 3,
        financialShorthand: "BC",
        quantity: 2,
        writtenMessage: null,
        messages: [
          { cardIndex: 1, writtenMessage: "Amy" },
          { cardIndex: 2, writtenMessage: "Mum" },
        ],
        sortOrder: 10,
      },
    ],
  } as unknown as StorefrontOrder;

  assert.equal(
    orderMateriallyAffectsConfirmation(baseOrder, {
      customerName: "Amy",
      phone: "012",
      pickupDate: "2026-08-15",
      pickupTime: "14:00",
      items: baseOrder.items,
      complimentaryItems: [],
      paidAddons: [
        {
          code: "birthday_card",
          quantity: 2,
          unitPrice: 3,
          name: "Birthday Card",
          financialShorthand: "BC",
          messages: [
            { cardIndex: 1, writtenMessage: "Amy" },
            { cardIndex: 2, writtenMessage: "Dad" },
          ],
        },
      ],
    }),
    true,
  );

  const legacy = {
    ...baseOrder,
    paidAddons: undefined,
  } as unknown as StorefrontOrder;
  assert.equal(
    orderMateriallyAffectsConfirmation(legacy, {
      customerName: "Amy",
      phone: "012",
      pickupDate: "2026-08-15",
      pickupTime: "14:00",
      items: baseOrder.items,
      complimentaryItems: [],
      paidAddons: [],
    }),
    false,
  );
}

// C. Financial — message rows do not add money; equation uses qty once
{
  const cake125 = [{ unitPrice: 125, quantity: 1 }];
  const bc1 = [{ unitPrice: 3, quantity: 1, financialShorthand: "BC" }];
  const bc2 = [{ unitPrice: 3, quantity: 2, financialShorthand: "BC" }];
  const bc3 = [{ unitPrice: 3, quantity: 3, financialShorthand: "BC" }];
  const wc1 = [{ unitPrice: 3, quantity: 1, financialShorthand: "WC" }];

  assert.equal(
    calculateCommercialSubtotal({ items: cake125, paidAddons: bc1 }),
    128,
  );
  assert.equal(
    calculateCommercialSubtotal({ items: cake125, paidAddons: bc2 }),
    131,
  );
  assert.equal(
    calculateCommercialSubtotal({ items: cake125, paidAddons: bc3 }),
    134,
  );
  assert.equal(
    calculateCommercialSubtotal({
      items: cake125,
      paidAddons: [...bc1, ...wc1],
    }),
    131,
  );
  assert.equal(calculatePaidAddonSubtotal(bc2), 6);

  assert.equal(
    formatOrderFinancialEquation({
      items: commercialEquationItems({ cakes: cake125, paidAddons: bc2 }),
      effective: [],
      amountDue: 131,
    }),
    "RM125+RM3*2(BC)= RM131",
  );
  assert.equal(
    formatOrderFinancialEquation({
      items: commercialEquationItems({
        cakes: cake125,
        paidAddons: [
          ...bc3,
          { unitPrice: 3, quantity: 2, financialShorthand: "WC" },
        ],
      }),
      effective: [],
      amountDue: 140,
    }),
    "RM125+RM3*3(BC)+RM3*2(WC)= RM140",
  );

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
    evaluateAugustPromoEligibility({
      ...augustBase,
      cakeSubtotal: 101,
    }).eligible,
    true,
  );
  assert.equal(
    evaluateAugustPromoEligibility({
      ...augustBase,
      cakeSubtotal: 125,
    }).eligible,
    true,
  );
}

console.log("M4-P1 Slice 3 paid-addons tests: PASSED");
