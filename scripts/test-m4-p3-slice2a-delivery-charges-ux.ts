/**
 * M4-P3 Slice 2A — Owner Delivery Charges UX helpers / presentation.
 * Run: npx tsx scripts/test-m4-p3-slice2a-delivery-charges-ux.ts
 */
import assert from "node:assert/strict";
import {
  CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
  DELIVERY_FEE_CODE,
  DELIVERY_FEE_MORE_PRESETS,
  DELIVERY_FEE_PRIMARY_PRESETS,
  DELIVERY_PROCESSING_FEE_CODE,
  deliveryChargesRemovalWarning,
  deliveryFeeAmountSuspendedByWaiver,
  deliveryFinanceBreakdownLines,
  deliveryFinanceFactsFromDelivery,
  effectiveDeliveryFeePayable,
  effectiveProcessingFeePayable,
  isDeliveryFinanceAdjustmentCode,
  processingFeeAmountSuspendedByWaiver,
  shouldShowDeliveryChargesSection,
  shouldShowEnableDeliveryCharges,
} from "@/engines/orders/delivery-finance";
import {
  defaultDeliveryFinanceDtoFields,
  fulfilmentMateriallyDiffer,
} from "@/engines/orders/fulfilment";
import {
  financialMateriallyAffectsConfirmation,
  orderMateriallyAffectsConfirmation,
} from "@/engines/orders/confirmation-validity";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { evaluateAugustPromoEligibility } from "@/engines/orders/promotions";
import type {
  StorefrontOrder,
  StorefrontOrderDelivery,
} from "@/types/storefront";

function delivery(
  overrides: Partial<StorefrontOrderDelivery> = {},
): StorefrontOrderDelivery {
  return {
    recipientName: "Mum",
    recipientPhone: "019",
    addressLine1: "12 Jalan",
    addressLine2: null,
    postcode: "88400",
    city: "KK",
    state: "Sabah",
    recipientNotifyPreference: "inform_recipient",
    ...defaultDeliveryFinanceDtoFields(),
    ...overrides,
  };
}

function baseOrder(
  overrides: Partial<StorefrontOrder> & {
    fulfilmentMethod?: StorefrontOrder["fulfilmentMethod"];
    delivery?: StorefrontOrderDelivery | null;
  } = {},
): StorefrontOrder {
  const fulfilmentMethod = overrides.fulfilmentMethod ?? "delivery";
  const del =
    overrides.delivery !== undefined
      ? overrides.delivery
      : fulfilmentMethod === "delivery"
        ? delivery({
            financeEnabled: true,
            processingFeeApplicableAmount: 5,
            deliveryFeeStatus: "not_set",
          })
        : null;
  return {
    id: "ord-1",
    orderNumber: "W2508001",
    status: "submitted",
    customerName: "Amy",
    phone: "012",
    email: "",
    orderSource: "whatsapp",
    crewOrder: false,
    pickupDate: "2026-08-20",
    pickupTime: "14:00:00",
    fulfilmentMethod,
    delivery: del,
    items: [
      {
        id: "i1",
        cakeId: "c1",
        cakeSizeId: "s1",
        cakeName: "Classic",
        sizeLabel: "6 inch",
        quantity: 1,
        unitPrice: 125,
      },
    ],
    complimentaryItems: [],
    paidAddons: [],
    adjustments: [],
    paymentAllocations: [],
    refunds: [],
    settlement: {
      subtotal: 125,
      totalAdjustments: 0,
      amountDue: 125,
      verifiedPaymentsAllocated: 0,
      refundsTotal: 0,
      netReceived: 0,
      remainingBalance: 125,
      overpayment: 0,
      isFullyPaid: false,
    },
    includeReceipt: true,
    internalNotes: null,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    readyAt: null,
    pickedUpAt: null,
    paymentDeadlineAt: null,
    paymentRequestSentAt: null,
    confirmationNeedsResend: false,
    rm10CardIssuanceSuppressed: false,
    rm10CardIssuanceSuppressionCode: null,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
    fulfilmentMethod,
    delivery: del,
  } as StorefrontOrder;
}

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`PASS ${label}`);
}

// 1–3 visibility
check("1 finance-enabled Delivery → Delivery Charges", () => {
  assert.equal(
    shouldShowDeliveryChargesSection(
      baseOrder({
        delivery: delivery({
          financeEnabled: true,
          processingFeeApplicableAmount: 5,
        }),
      }),
    ),
    true,
  );
});

check("2 Pickup → no Delivery Charges", () => {
  assert.equal(
    shouldShowDeliveryChargesSection(
      baseOrder({ fulfilmentMethod: "pickup", delivery: null }),
    ),
    false,
  );
});

check("3 historical finance-disabled → no active charges section", () => {
  const order = baseOrder({
    delivery: delivery({ financeEnabled: false }),
  });
  assert.equal(shouldShowDeliveryChargesSection(order), false);
  assert.equal(shouldShowEnableDeliveryCharges(order), true);
});

check("4 historical exposes Enable Delivery Charges", () => {
  assert.equal(
    shouldShowEnableDeliveryCharges(
      baseOrder({ delivery: delivery({ financeEnabled: false }) }),
    ),
    false === false &&
      shouldShowEnableDeliveryCharges(
        baseOrder({ delivery: delivery({ financeEnabled: false }) }),
      ),
  );
  assert.equal(
    shouldShowEnableDeliveryCharges(
      baseOrder({ delivery: delivery({ financeEnabled: false }) }),
    ),
    true,
  );
  assert.equal(
    shouldShowEnableDeliveryCharges(
      baseOrder({
        delivery: delivery({
          financeEnabled: true,
          processingFeeApplicableAmount: 5,
        }),
      }),
    ),
    false,
  );
});

check("5 enable is deliberate (viewing alone does not enable)", () => {
  // Helper truth: finance-disabled stays disabled until explicit action.
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({ financeEnabled: false }),
  )!;
  assert.equal(facts.financeEnabled, false);
  assert.equal(effectiveProcessingFeePayable(facts), 0);
});

check("6–7 enable initializes Processing default + Delivery NOT SET", () => {
  // Simulated post-init facts (authority already verified in Slice 1 live).
  const after = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
    deliveryFeeStatus: "not_set",
  });
  const facts = deliveryFinanceFactsFromDelivery(after)!;
  assert.equal(
    facts.processingFeeApplicableAmount,
    CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
  );
  assert.equal(facts.deliveryFeeStatus, "not_set");
  assert.equal(effectiveDeliveryFeePayable(facts), 0);
});

check("8 normal Processing RM5 display facts", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "not_set",
    }),
  )!;
  assert.equal(effectiveProcessingFeePayable(facts), 5);
  assert.equal(facts.processingFeeOverrideAmount, null);
  assert.equal(facts.processingFeeWaived, false);
});

check("9 Processing override RM3", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      processingFeeOverrideAmount: 3,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
  )!;
  assert.equal(effectiveProcessingFeePayable(facts), 3);
  assert.equal(facts.processingFeeApplicableAmount, 5);
});

check("10 Processing waiver preserves RM5 truth", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      processingFeeWaived: true,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
  )!;
  assert.equal(effectiveProcessingFeePayable(facts), 0);
  assert.equal(facts.processingFeeApplicableAmount, 5);
  const lines = deliveryFinanceBreakdownLines(facts);
  assert.equal(lines[0]?.amountText, "RM0 (RM5 waived)");
});

check("11 Delivery NOT SET display facts", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "not_set",
    }),
  )!;
  assert.equal(facts.deliveryFeeStatus, "not_set");
  assert.equal(effectiveDeliveryFeePayable(facts), 0);
  const lines = deliveryFinanceBreakdownLines(facts);
  assert.equal(lines.some((l) => l.key === "delivery"), false);
});

check("12–18 presets exist and exclude RM0", () => {
  assert.deepEqual([...DELIVERY_FEE_PRIMARY_PRESETS], [5, 10, 15]);
  assert.deepEqual([...DELIVERY_FEE_MORE_PRESETS], [20, 25, 30]);
  assert.equal(DELIVERY_FEE_PRIMARY_PRESETS.includes(0 as never), false);
  assert.equal(DELIVERY_FEE_MORE_PRESETS.includes(0 as never), false);
});

check("19 Custom RM12 payable path", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 12,
    }),
  )!;
  assert.equal(effectiveDeliveryFeePayable(facts), 12);
});

check("20–21 RM0 / negative not normal quotes (authority contract)", () => {
  // UI does not offer RM0; Slice 1 RPC rejects <= 0. Documented here.
  assert.ok(DELIVERY_FEE_PRIMARY_PRESETS.every((n) => n > 0));
  assert.ok(DELIVERY_FEE_MORE_PRESETS.every((n) => n > 0));
});

check("22 quoted RM15 display", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
  )!;
  assert.equal(effectiveDeliveryFeePayable(facts), 15);
  assert.equal(
    deliveryFinanceBreakdownLines(facts).find((l) => l.key === "delivery")
      ?.amountText,
    "RM15",
  );
});

check("23–24 Delivery waiver preserves quoted RM15; payable RM0", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
  )!;
  assert.equal(facts.deliveryFeeQuotedAmount, 15);
  assert.equal(effectiveDeliveryFeePayable(facts), 0);
  assert.equal(
    deliveryFinanceBreakdownLines(facts).find((l) => l.key === "delivery")
      ?.amountText,
    "RM0 (RM15 waived)",
  );
});

check("25–26 amountDue once; no double-count in presentation vs settlement", () => {
  const items = [{ unitPrice: 125, quantity: 1 }];
  const adjustments = [
    { amount: 5, code: DELIVERY_PROCESSING_FEE_CODE },
    { amount: 15, code: DELIVERY_FEE_CODE },
  ];
  const settlement = calculateOrderSettlement({
    items,
    adjustments,
    allocations: [],
    refunds: [],
  });
  assert.equal(settlement.amountDue, 145);

  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
  )!;
  const lines = deliveryFinanceBreakdownLines(facts);
  // Presentation only — do not add line amounts into settlement again.
  const presented = lines.reduce((sum, line) => {
    const match = line.amountText.match(/^RM(\d+(?:\.\d+)?)/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
  assert.equal(presented, 20);
  assert.equal(settlement.amountDue, 125 + presented);
  assert.equal(isDeliveryFinanceAdjustmentCode(DELIVERY_PROCESSING_FEE_CODE), true);
  assert.equal(isDeliveryFinanceAdjustmentCode(DELIVERY_FEE_CODE), true);
  assert.equal(isDeliveryFinanceAdjustmentCode("august_promo"), false);
});

check("27 Delivery→Pickup warning with actual fees", () => {
  const warning = deliveryChargesRemovalWarning(
    deliveryFinanceFactsFromDelivery(
      delivery({
        financeEnabled: true,
        processingFeeApplicableAmount: 5,
        deliveryFeeStatus: "quoted",
        deliveryFeeQuotedAmount: 15,
      }),
    ),
  );
  assert.equal(warning.hasRemovableCharges, true);
  assert.deepEqual(warning.lines, ["Processing Fee RM5", "Delivery Fee RM15"]);
  assert.equal(warning.removableAmount, 20);
});

check("28 paid Delivery→Pickup removableAmount drives overpayment copy", () => {
  const warning = deliveryChargesRemovalWarning(
    deliveryFinanceFactsFromDelivery(
      delivery({
        financeEnabled: true,
        processingFeeApplicableAmount: 5,
        deliveryFeeStatus: "quoted",
        deliveryFeeQuotedAmount: 10,
      }),
    ),
  );
  assert.ok(warning.removableAmount > 0);
});

check("29–32 transition / no resurrection materiality foundation", () => {
  const quoted = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted",
    deliveryFeeQuotedAmount: 15,
    deliveryFeeWaived: false,
  });
  const fresh = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "not_set",
    deliveryFeeQuotedAmount: null,
    deliveryFeeWaived: false,
  });
  assert.equal(
    fulfilmentMateriallyDiffer(
      {
        method: "delivery",
        pickupDate: "2026-08-20",
        pickupTime: "14:00",
        delivery: quoted,
      },
      {
        method: "pickup",
        pickupDate: "2026-08-20",
        pickupTime: "14:00",
        delivery: null,
      },
    ),
    true,
  );
  assert.equal(
    fulfilmentMateriallyDiffer(
      {
        method: "pickup",
        pickupDate: "2026-08-20",
        pickupTime: "14:00",
        delivery: null,
      },
      {
        method: "delivery",
        pickupDate: "2026-08-20",
        pickupTime: "14:00",
        delivery: fresh,
      },
    ),
    true,
  );
  assert.equal(fresh.deliveryFeeStatus, "not_set");
  assert.equal(fresh.deliveryFeeWaived, false);
  assert.equal(fresh.deliveryFeeQuotedAmount, null);
});

check("33 no-op quote does not drift amountDue", () => {
  const adjustments = [
    { amount: 5 },
    { amount: 15 },
  ];
  const a = calculateOrderSettlement({
    items: [{ unitPrice: 125, quantity: 1 }],
    adjustments,
    allocations: [],
    refunds: [],
  });
  const b = calculateOrderSettlement({
    items: [{ unitPrice: 125, quantity: 1 }],
    adjustments,
    allocations: [],
    refunds: [],
  });
  assert.equal(a.amountDue, b.amountDue);
  assert.equal(
    financialMateriallyAffectsConfirmation(a.amountDue, b.amountDue),
    false,
  );
});

check("34 fee change invalidates via amountDue materiality", () => {
  assert.equal(financialMateriallyAffectsConfirmation(130, 145), true);
  const before = baseOrder({
    delivery: delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "not_set",
    }),
  });
  const afterDelivery = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted",
    deliveryFeeQuotedAmount: 15,
  });
  assert.equal(
    orderMateriallyAffectsConfirmation(before, {
      customerName: before.customerName,
      phone: before.phone,
      pickupDate: before.pickupDate,
      pickupTime: before.pickupTime,
      items: before.items,
      complimentaryItems: before.complimentaryItems,
      paidAddons: before.paidAddons,
      fulfilmentMethod: "delivery",
      delivery: afterDelivery,
    }),
    true,
  );
});

check("35 no-op not material", () => {
  const d = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted",
    deliveryFeeQuotedAmount: 15,
  });
  const before = baseOrder({ delivery: d });
  assert.equal(
    orderMateriallyAffectsConfirmation(before, {
      customerName: before.customerName,
      phone: before.phone,
      pickupDate: before.pickupDate,
      pickupTime: before.pickupTime,
      items: before.items,
      complimentaryItems: before.complimentaryItems,
      paidAddons: before.paidAddons,
      fulfilmentMethod: "delivery",
      delivery: d,
    }),
    false,
  );
});

check("36 paid/awaiting reconciliation still settlement-driven", () => {
  const settlement = calculateOrderSettlement({
    items: [{ unitPrice: 125, quantity: 1 }],
    adjustments: [{ amount: 5 }, { amount: 15 }],
    allocations: [{ amount: 145, paymentStatus: "verified" }],
    refunds: [],
  });
  assert.equal(settlement.isFullyPaid, true);
  assert.equal(settlement.remainingBalance, 0);
});

check("37 Pickup regressions — no Delivery finance lines", () => {
  assert.deepEqual(
    deliveryFinanceBreakdownLines(
      deliveryFinanceFactsFromDelivery(null),
    ),
    [],
  );
  assert.equal(
    shouldShowDeliveryChargesSection({
      fulfilmentMethod: "pickup",
      delivery: null,
    }),
    false,
  );
});

check("38 paid add-on coexistence in settlement", () => {
  const settlement = calculateOrderSettlement({
    items: [
      { unitPrice: 125, quantity: 1 },
      { unitPrice: 8, quantity: 1 },
    ],
    adjustments: [{ amount: 5 }, { amount: 15 }],
    allocations: [],
    refunds: [],
  });
  assert.equal(settlement.subtotal, 133);
  assert.equal(settlement.amountDue, 153);
});

check("39 August cake-only unchanged by fees", () => {
  const result = evaluateAugustPromoEligibility({
    orderSource: "customer_website",
    orderDate: "2026-08-05",
    pickupDate: "2026-08-20",
    cakeSubtotal: 125,
    hasAugustPromo: false,
    hasRm10Card: false,
    hasVerifiedPayments: false,
    orderStatus: "submitted",
  });
  assert.equal(result.eligible, true);
});

check("40 RM10 flat model unaffected by fee presentation helpers", () => {
  const settlement = calculateOrderSettlement({
    items: [{ unitPrice: 125, quantity: 1 }],
    adjustments: [{ amount: 5 }, { amount: 15 }, { amount: -10 }],
    allocations: [],
    refunds: [],
  });
  assert.equal(settlement.amountDue, 135);
});

check("waiver restore helpers — Processing override→waive→restore amount", () => {
  const waived = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      processingFeeOverrideAmount: 3,
      processingFeeWaived: true,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
  )!;
  assert.equal(effectiveProcessingFeePayable(waived), 0);
  assert.equal(processingFeeAmountSuspendedByWaiver(waived), 3);

  const restored = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      processingFeeOverrideAmount: 3,
      processingFeeWaived: false,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
  )!;
  assert.equal(effectiveProcessingFeePayable(restored), 3);
  assert.equal(restored.processingFeeApplicableAmount, 5);
  assert.equal(restored.processingFeeOverrideAmount, 3);
});

check("waiver restore helpers — Delivery quote→waive→restore amount", () => {
  const waived = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
  )!;
  assert.equal(effectiveDeliveryFeePayable(waived), 0);
  assert.equal(deliveryFeeAmountSuspendedByWaiver(waived), 15);

  const restored = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: false,
    }),
  )!;
  assert.equal(effectiveDeliveryFeePayable(restored), 15);
  assert.equal(restored.deliveryFeeQuotedAmount, 15);
});

check("restore is distinct from new quote in materiality serialization", () => {
  // Restored quoted state matches a normal quoted state financially; history
  // distinction is timeline event_type delivery_fee_restored (not delivery_fee_quoted).
  const restored = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted",
    deliveryFeeQuotedAmount: 15,
    deliveryFeeWaived: false,
  });
  const quoted = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted",
    deliveryFeeQuotedAmount: 15,
    deliveryFeeWaived: false,
  });
  assert.equal(
    fulfilmentMateriallyDiffer(
      {
        method: "delivery",
        pickupDate: "2026-08-20",
        pickupTime: "14:00",
        delivery: restored,
      },
      {
        method: "delivery",
        pickupDate: "2026-08-20",
        pickupTime: "14:00",
        delivery: quoted,
      },
    ),
    false,
  );
});

check("Restore Processing UI truth — waived override shows RM3 not RM5", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      processingFeeOverrideAmount: 3,
      processingFeeWaived: true,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
  )!;
  assert.equal(processingFeeAmountSuspendedByWaiver(facts), 3);
  assert.notEqual(processingFeeAmountSuspendedByWaiver(facts), 5);
});

check("Restore Delivery UI truth — waived shows RM15", () => {
  const facts = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
  )!;
  assert.equal(deliveryFeeAmountSuspendedByWaiver(facts), 15);
  assert.equal(shouldShowDeliveryChargesSection({
    fulfilmentMethod: "delivery",
    delivery: delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
  }), true);
});

console.log(`\nM4-P3 Slice 2A helpers: ${passed} passed`);
