/**
 * M4-P3 Slice 1 — Delivery financial authority (helpers + materiality foundation).
 * Run: npx tsx scripts/test-m4-p3-slice1-delivery-finance-helpers.ts
 */
import assert from "node:assert/strict";
import {
  CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT,
  DELIVERY_FEE_CODE,
  DELIVERY_PROCESSING_FEE_CODE,
  deliveryFinanceFactsFromDelivery,
  effectiveDeliveryFeePayable,
  effectiveProcessingFeePayable,
  isDeliveryFinanceComplete,
} from "@/engines/orders/delivery-finance";
import {
  defaultDeliveryFinanceDtoFields,
  fulfilmentMateriallyDiffer,
} from "@/engines/orders/fulfilment";
import {
  orderMateriallyAffectsConfirmation,
  shouldOutdateSentConfirmation,
} from "@/engines/orders/confirmation-validity";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { commercialLinesForSettlement } from "@/engines/orders/totals";
import { evaluateAugustPromoEligibility } from "@/engines/orders/promotions";
import type {
  StorefrontOrder,
  StorefrontOrderDelivery,
} from "@/types/storefront";

assert.equal(CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT, 5);
assert.equal(DELIVERY_PROCESSING_FEE_CODE, "delivery_processing_fee");
assert.equal(DELIVERY_FEE_CODE, "delivery_fee");

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

// NOT SET vs quoted vs waived
{
  const notSet = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "not_set",
  });
  const facts = deliveryFinanceFactsFromDelivery(notSet)!;
  assert.equal(effectiveProcessingFeePayable(facts), 5);
  assert.equal(effectiveDeliveryFeePayable(facts), 0);
  assert.equal(isDeliveryFinanceComplete(facts), false);

  const quoted = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted",
    deliveryFeeQuotedAmount: 15,
  });
  const q = deliveryFinanceFactsFromDelivery(quoted)!;
  assert.equal(effectiveDeliveryFeePayable(q), 15);
  assert.equal(isDeliveryFinanceComplete(q), true);

  const waived = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted_waived",
    deliveryFeeQuotedAmount: 15,
    deliveryFeeWaived: true,
  });
  const w = deliveryFinanceFactsFromDelivery(waived)!;
  assert.equal(effectiveDeliveryFeePayable(w), 0);
  assert.equal(isDeliveryFinanceComplete(w), true);
  assert.equal(waived.deliveryFeeQuotedAmount, 15);
}

// Processing override + waiver
{
  const override = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      processingFeeOverrideAmount: 3,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 10,
    }),
  )!;
  assert.equal(effectiveProcessingFeePayable(override), 3);

  const waived = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      processingFeeWaived: true,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 10,
    }),
  )!;
  assert.equal(effectiveProcessingFeePayable(waived), 0);
  assert.equal(effectiveDeliveryFeePayable(waived), 10);
}

// Historical finance disabled → no payable fees
{
  const hist = deliveryFinanceFactsFromDelivery(
    delivery({
      financeEnabled: false,
      processingFeeApplicableAmount: null,
      deliveryFeeStatus: "not_set",
    }),
  )!;
  assert.equal(effectiveProcessingFeePayable(hist), 0);
  assert.equal(effectiveDeliveryFeePayable(hist), 0);
  assert.equal(isDeliveryFinanceComplete(hist), false);
}

// Settlement coexistence with fee adjustments
{
  const settled = calculateOrderSettlement({
    items: commercialLinesForSettlement({
      items: [{ unitPrice: 125, quantity: 1 }],
      paidAddons: [{ unitPrice: 3, quantity: 1 }],
    }),
    adjustments: [
      { amount: 5, code: DELIVERY_PROCESSING_FEE_CODE },
      { amount: 15, code: DELIVERY_FEE_CODE },
      { amount: -10, code: "rm10_card" },
    ],
    allocations: [],
    refunds: [],
  });
  assert.equal(settled.subtotal, 128);
  assert.equal(settled.amountDue, 138);
}

// August cake-only — fees do not help eligibility
assert.equal(
  evaluateAugustPromoEligibility({
    orderSource: "customer_website",
    orderDate: "2026-08-01",
    pickupDate: "2026-08-15",
    cakeSubtotal: 99,
    hasAugustPromo: false,
    hasRm10Card: false,
    hasVerifiedPayments: false,
    orderStatus: "submitted",
  }).eligible,
  false,
);

// Confirmation materiality foundation (AQ–AV)
function baseOrder(
  overrides: Partial<StorefrontOrder> = {},
): StorefrontOrder {
  return {
    id: "o1",
    orderNumber: "WOS-1",
    status: "awaiting_payment",
    customerName: "Amy",
    phone: "012",
    email: null,
    pickupDate: "2026-08-20",
    pickupTime: "14:00:00",
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
    delivery: delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
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
    paidAddons: [],
    settlement: {
      amountDue: 145,
      netReceived: 0,
      remainingBalance: 145,
      overpayment: 0,
    },
    ...overrides,
  } as StorefrontOrder;
}

{
  const before = baseOrder();
  const afterQuote = {
    ...before,
    delivery: delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 20,
    }),
    settlement: { ...before.settlement, amountDue: 150, remainingBalance: 150 },
  };
  assert.equal(
    fulfilmentMateriallyDiffer(
      {
        method: "delivery",
        pickupDate: before.pickupDate,
        pickupTime: before.pickupTime,
        delivery: before.delivery,
      },
      {
        method: "delivery",
        pickupDate: afterQuote.pickupDate,
        pickupTime: afterQuote.pickupTime,
        delivery: afterQuote.delivery,
      },
    ),
    true,
  );
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
      delivery: afterQuote.delivery,
    }),
    true,
  );

  const waivedDelivery = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    deliveryFeeStatus: "quoted_waived",
    deliveryFeeQuotedAmount: 15,
    deliveryFeeWaived: true,
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
      delivery: waivedDelivery,
    }),
    true,
  );

  const processingOverride = delivery({
    financeEnabled: true,
    processingFeeApplicableAmount: 5,
    processingFeeOverrideAmount: 3,
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
      delivery: processingOverride,
    }),
    true,
  );

  // AV no-op
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
      delivery: before.delivery,
    }),
    false,
  );

  // Pending request fields alone should not be Confirmation-material
  const pendingOnly = {
    ...before.delivery!,
    deliveryFeeRequest: {
      ...before.delivery!.deliveryFeeRequest,
      status: "pending" as const,
      reason: "VIP",
      quotedAmount: before.delivery!.deliveryFeeQuotedAmount,
      requestedBy: "staff-1",
      requestedAt: "2026-08-11T00:00:00Z",
    },
  };
  assert.equal(
    fulfilmentMateriallyDiffer(
      {
        method: "delivery",
        pickupDate: before.pickupDate,
        pickupTime: before.pickupTime,
        delivery: before.delivery,
      },
      {
        method: "delivery",
        pickupDate: before.pickupDate,
        pickupTime: before.pickupTime,
        delivery: pendingOnly,
      },
    ),
    false,
  );

  assert.equal(
    shouldOutdateSentConfirmation({
      orderStatus: "awaiting_payment",
      materialChange: true,
    }),
    true,
  );
}

console.log("M4-P3 Slice 1 delivery-finance helper tests: PASSED");
