/**
 * M4-P3 Slice 3 — Customer Confirmation + Payment Request Delivery fee equation.
 * Run: npx tsx scripts/test-m4-p3-slice3-confirmation-equation.ts
 *
 * No migration. Presentation only. Pickup Confirmation remains bit-compatible.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildConfirmationPayload,
  CONFIRMATION_SECTION_SEPARATOR,
  DELIVERY_FEE_WAIVED_CONFIRMATION_LINE,
  formatConfirmationAmountSection,
  formatConfirmationDeliveryFinanceWaiverLines,
  formatConfirmationFinancialBlock,
  generateConfirmationMessage,
  PROCESSING_FEE_WAIVED_CONFIRMATION_LINE,
} from "@/engines/orders/confirmation-message";
import {
  canAccessCustomerConfirmation,
  MISSING_DELIVERY_FEE_ADD_ACTION,
  MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_BODY,
  MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_TITLE,
  MISSING_DELIVERY_FEE_CONTINUE_ACTION,
  shouldWarnMissingDeliveryFeeBeforeConfirmation,
} from "@/engines/orders/confirmation-validity";
import {
  equationAdjustmentShorthand,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import {
  DELIVERY_CHARGES_SECTION_ID,
  DELIVERY_FEE_CODE,
  DELIVERY_PROCESSING_FEE_CODE,
  deliveryFinanceFactsFromDelivery,
  isDeliveryFeeDeliberatelyWaived,
  isProcessingFeeDeliberatelyWaived,
} from "@/engines/orders/delivery-finance";
import { defaultDeliveryFinanceDtoFields } from "@/engines/orders/fulfilment";
import {
  customerFacingAdjustmentLabel,
  formatPaymentRequestAmountBlock,
} from "@/engines/orders/payment-message";
import { deliveryChargesSectionHref } from "@/workspaces/owner/orders/missing-delivery-fee-confirmation";
import type { StorefrontOrderDelivery } from "@/types/storefront";

function cake(unitPrice = 125, quantity = 1) {
  return {
    cakeName: "Red Dates",
    sizeLabel: '6"',
    quantity,
    unitPrice,
  };
}

function confirmationPayload(
  overrides: Partial<Parameters<typeof buildConfirmationPayload>[0]> = {},
) {
  return buildConfirmationPayload({
    staffCustomerFacingName: "Wee",
    customerName: "Lisa",
    customerPhone: "01135062106",
    pickupDate: "2026-08-14",
    pickupTime: "15:00",
    items: [cake()],
    complimentaryItems: [],
    paidAddons: [],
    subtotal: 125,
    adjustments: [],
    amountDue: 125,
    fulfilmentMethod: "pickup",
    ...overrides,
  });
}

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

const processingAdj = {
  label: "Delivery Processing Fee",
  amount: 5,
  code: DELIVERY_PROCESSING_FEE_CODE,
  metadata: {},
};
const deliveryAdj = {
  label: "Delivery Fee",
  amount: 15,
  code: DELIVERY_FEE_CODE,
  metadata: {},
};
const bcAdj = {
  name: "Birthday Card",
  quantity: 1,
  unitPrice: 3,
  financialShorthand: "BC",
};
const augustAdj = {
  label: "August Promo",
  amount: -20,
  code: "august_promo_2026",
  metadata: {},
};
const rm10Adj = {
  label: "RM10 Discount Card",
  amount: -10,
  code: "rm10_physical_card",
  metadata: { voucher_number: "A038" },
};

assert.equal(
  equationAdjustmentShorthand(processingAdj),
  "Processing",
);
assert.equal(equationAdjustmentShorthand(deliveryAdj), "Delivery");

// Pickup — no Delivery finance → historical concise Confirmation
assert.equal(
  formatConfirmationFinancialBlock(confirmationPayload()),
  "RM125",
);

// Processing only (Delivery Fee NOT SET or waived)
assert.equal(
  formatConfirmationFinancialBlock(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      subtotal: 125,
      amountDue: 130,
      adjustments: [processingAdj],
    }),
  ),
  "RM125+RM5(Processing)= RM130",
);

// Quoted Delivery + Processing
assert.equal(
  formatConfirmationFinancialBlock(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      subtotal: 125,
      amountDue: 145,
      adjustments: [processingAdj, deliveryAdj],
    }),
  ),
  "RM125+RM5(Processing)+RM15(Delivery)= RM145",
);

// Processing waived (no processing adj) + quoted Delivery
assert.equal(
  formatConfirmationFinancialBlock(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      subtotal: 125,
      amountDue: 140,
      adjustments: [deliveryAdj],
    }),
  ),
  "RM125+RM15(Delivery)= RM140",
);

// Zero-amount fee rows must not appear
assert.equal(
  formatOrderFinancialEquation({
    items: [{ unitPrice: 125, quantity: 1 }],
    effective: [
      { ...processingAdj, amount: 0 },
      deliveryAdj,
    ],
    amountDue: 140,
  }),
  "RM125+RM15(Delivery)= RM140",
);

// Recon natural extension: cakes + BC + fees + voucher
assert.equal(
  formatConfirmationFinancialBlock(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      paidAddons: [bcAdj],
      subtotal: 128,
      amountDue: 138,
      adjustments: [processingAdj, deliveryAdj, rm10Adj],
    }),
  ),
  "RM125+RM3(BC)+RM5(Processing)+RM15(Delivery)-RM10(Voucher No.A038)= RM138",
);

assert.equal(
  formatConfirmationFinancialBlock(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      paidAddons: [bcAdj],
      subtotal: 128,
      amountDue: 128,
      adjustments: [processingAdj, deliveryAdj, augustAdj],
    }),
  ),
  "RM125+RM3(BC)+RM5(Processing)+RM15(Delivery)-RM20(AugPromo)= RM128",
);

const deliveryConf = generateConfirmationMessage(
  confirmationPayload({
    fulfilmentMethod: "delivery",
    amountDue: 145,
    adjustments: [processingAdj, deliveryAdj],
  }),
);
assert.ok(deliveryConf.includes("RM125+RM5(Processing)+RM15(Delivery)= RM145"));
assert.ok(deliveryConf.includes(CONFIRMATION_SECTION_SEPARATOR));
assert.equal(
  (deliveryConf.match(/_{60}/g) ?? []).length,
  2,
);
assert.ok(!deliveryConf.includes("DeliveryProce"));
assert.ok(!deliveryConf.includes("DeliveryFee"));
assert.ok(!deliveryConf.includes("(NYP)"));

const pickupConf = generateConfirmationMessage(confirmationPayload());
assert.ok(pickupConf.includes("\nRM125\n"));
assert.ok(!pickupConf.includes("(Processing)"));
assert.ok(!pickupConf.includes("(Delivery)"));
assert.ok(!pickupConf.includes("Waived"));
assert.equal(formatConfirmationAmountSection(confirmationPayload()), "RM125");

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

assert.equal(
  formatPaymentRequestAmountBlock({
    commercialSubtotal: 125,
    amountDue: 145,
    netReceived: 0,
    remainingBalance: 145,
    adjustments: [
      {
        label: "Delivery Processing Fee",
        amount: 5,
        code: DELIVERY_PROCESSING_FEE_CODE,
      },
      {
        label: "Delivery Fee",
        amount: 15,
        code: DELIVERY_FEE_CODE,
      },
    ],
  }),
  "Order Total: RM125\nProcessing Fee: +RM5\nDelivery Fee: +RM15\nAmount: RM145",
);

assert.equal(
  formatPaymentRequestAmountBlock({
    commercialSubtotal: 125,
    amountDue: 125,
    netReceived: 0,
    remainingBalance: 125,
    adjustments: [],
  }),
  "Amount: RM125",
);

assert.equal(PROCESSING_FEE_WAIVED_CONFIRMATION_LINE, "Processing Fee: Waived");
assert.equal(DELIVERY_FEE_WAIVED_CONFIRMATION_LINE, "Delivery Fee: Waived");

const financeQuoted = delivery({
  financeEnabled: true,
  processingFeeApplicableAmount: 5,
  processingFeeWaived: false,
  deliveryFeeStatus: "quoted",
  deliveryFeeQuotedAmount: 15,
  deliveryFeeWaived: false,
});
const financeNotSet = delivery({
  financeEnabled: true,
  processingFeeApplicableAmount: 5,
  processingFeeWaived: false,
  deliveryFeeStatus: "not_set",
  deliveryFeeQuotedAmount: null,
  deliveryFeeWaived: false,
});
const financeDeliveryWaived = delivery({
  financeEnabled: true,
  processingFeeApplicableAmount: 5,
  processingFeeWaived: false,
  deliveryFeeStatus: "quoted_waived",
  deliveryFeeQuotedAmount: 15,
  deliveryFeeWaived: true,
});
const financeProcessingWaived = delivery({
  financeEnabled: true,
  processingFeeApplicableAmount: 5,
  processingFeeWaived: true,
  deliveryFeeStatus: "quoted",
  deliveryFeeQuotedAmount: 15,
  deliveryFeeWaived: false,
});
const financeBothWaived = delivery({
  financeEnabled: true,
  processingFeeApplicableAmount: 5,
  processingFeeWaived: true,
  deliveryFeeStatus: "quoted_waived",
  deliveryFeeQuotedAmount: 15,
  deliveryFeeWaived: true,
});
const financeOverride = delivery({
  financeEnabled: true,
  processingFeeApplicableAmount: 5,
  processingFeeOverrideAmount: 3,
  processingFeeWaived: false,
  deliveryFeeStatus: "quoted",
  deliveryFeeQuotedAmount: 15,
  deliveryFeeWaived: false,
});
const financeOverrideWaived = delivery({
  financeEnabled: true,
  processingFeeApplicableAmount: 5,
  processingFeeOverrideAmount: 3,
  processingFeeWaived: true,
  deliveryFeeStatus: "quoted",
  deliveryFeeQuotedAmount: 15,
  deliveryFeeWaived: false,
});

assert.equal(
  isProcessingFeeDeliberatelyWaived(deliveryFinanceFactsFromDelivery(financeQuoted)),
  false,
);
assert.equal(
  isDeliveryFeeDeliberatelyWaived(deliveryFinanceFactsFromDelivery(financeQuoted)),
  false,
);
assert.equal(
  isDeliveryFeeDeliberatelyWaived(deliveryFinanceFactsFromDelivery(financeNotSet)),
  false,
);
assert.equal(
  isDeliveryFeeDeliberatelyWaived(
    deliveryFinanceFactsFromDelivery(financeDeliveryWaived),
  ),
  true,
);
assert.equal(
  isProcessingFeeDeliberatelyWaived(
    deliveryFinanceFactsFromDelivery(financeProcessingWaived),
  ),
  true,
);
assert.equal(
  isDeliveryFeeDeliberatelyWaived(
    deliveryFinanceFactsFromDelivery(
      delivery({
        financeEnabled: true,
        deliveryFeeStatus: "not_set",
        deliveryFeeWaived: true,
      }),
    ),
  ),
  false,
);
assert.equal(
  isProcessingFeeDeliberatelyWaived(
    deliveryFinanceFactsFromDelivery(
      delivery({
        financeEnabled: true,
        processingFeeApplicableAmount: 0,
        processingFeeWaived: false,
        deliveryFeeStatus: "quoted",
        deliveryFeeQuotedAmount: 15,
      }),
    ),
  ),
  false,
);

assert.equal(
  formatConfirmationDeliveryFinanceWaiverLines({
    fulfilmentMethod: "pickup",
    delivery: null,
  }),
  null,
);

// 1 Pickup — no waiver lines
assert.equal(formatConfirmationAmountSection(confirmationPayload()), "RM125");

// 2 Delivery + Processing RM5 + Delivery NOT SET
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeNotSet,
      adjustments: [processingAdj],
      amountDue: 130,
    }),
  ),
  "RM125+RM5(Processing)= RM130",
);

// 3 Delivery RM15 active
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeQuoted,
      adjustments: [processingAdj, deliveryAdj],
      amountDue: 145,
    }),
  ),
  "RM125+RM5(Processing)+RM15(Delivery)= RM145",
);

// 4 Delivery RM15 waived
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeDeliveryWaived,
      adjustments: [processingAdj],
      amountDue: 130,
    }),
  ),
  "RM125+RM5(Processing)= RM130\nDelivery Fee: Waived",
);

// 5 Delivery restored to RM15
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeQuoted,
      adjustments: [processingAdj, deliveryAdj],
      amountDue: 145,
    }),
  ),
  "RM125+RM5(Processing)+RM15(Delivery)= RM145",
);

// 6 Processing RM5 waived + Delivery RM15
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeProcessingWaived,
      adjustments: [deliveryAdj],
      amountDue: 140,
    }),
  ),
  "RM125+RM15(Delivery)= RM140\nProcessing Fee: Waived",
);

const processingOverrideAdj = {
  label: "Delivery Processing Fee",
  amount: 3,
  code: DELIVERY_PROCESSING_FEE_CODE,
  metadata: {},
};

// 7 Processing override RM3
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeOverride,
      adjustments: [processingOverrideAdj, deliveryAdj],
      amountDue: 143,
    }),
  ),
  "RM125+RM3(Processing)+RM15(Delivery)= RM143",
);

// 8 Processing RM3 waived
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeOverrideWaived,
      adjustments: [deliveryAdj],
      amountDue: 140,
    }),
  ),
  "RM125+RM15(Delivery)= RM140\nProcessing Fee: Waived",
);

// 9 Processing restored after waiver (override RM3 returns)
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeOverride,
      adjustments: [processingOverrideAdj, deliveryAdj],
      amountDue: 143,
    }),
  ),
  "RM125+RM3(Processing)+RM15(Delivery)= RM143",
);

// 10 Both waived
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeBothWaived,
      adjustments: [],
      amountDue: 125,
    }),
  ),
  "RM125\nProcessing Fee: Waived\nDelivery Fee: Waived",
);

// 11 BC / voucher — waiver after complete equation, not inside it
assert.equal(
  formatConfirmationAmountSection(
    confirmationPayload({
      fulfilmentMethod: "delivery",
      delivery: financeDeliveryWaived,
      paidAddons: [bcAdj],
      subtotal: 128,
      amountDue: 123,
      adjustments: [processingAdj, rm10Adj],
    }),
  ),
  "RM125+RM3(BC)+RM5(Processing)-RM10(Voucher No.A038)= RM123\nDelivery Fee: Waived",
);

const waivedWithComplimentary = generateConfirmationMessage(
  confirmationPayload({
    fulfilmentMethod: "delivery",
    delivery: financeDeliveryWaived,
    complimentaryItems: [{ name: "Candle", quantity: 1 }],
    adjustments: [processingAdj],
    amountDue: 130,
  }),
);
assert.ok(
  waivedWithComplimentary.includes(
    "RM125+RM5(Processing)= RM130\nDelivery Fee: Waived\n\n*Complimentary Candle x1",
  ),
);

// 12 Frozen sent message — later restore does not rewrite historical body
const sentWaivedBody = generateConfirmationMessage(
  confirmationPayload({
    fulfilmentMethod: "delivery",
    delivery: financeDeliveryWaived,
    adjustments: [processingAdj],
    amountDue: 130,
  }),
);
assert.ok(sentWaivedBody.includes("RM125+RM5(Processing)= RM130"));
assert.ok(sentWaivedBody.includes("Delivery Fee: Waived"));
assert.ok(!sentWaivedBody.includes("RM15(Delivery)"));

const restoredLiveBody = generateConfirmationMessage(
  confirmationPayload({
    fulfilmentMethod: "delivery",
    delivery: financeQuoted,
    adjustments: [processingAdj, deliveryAdj],
    amountDue: 145,
  }),
);
assert.ok(
  restoredLiveBody.includes("RM125+RM5(Processing)+RM15(Delivery)= RM145"),
);
assert.ok(!restoredLiveBody.includes("Delivery Fee: Waived"));
assert.ok(sentWaivedBody.includes("Delivery Fee: Waived"));
assert.ok(!sentWaivedBody.includes("RM15(Delivery)"));

assert.ok(
  !formatPaymentRequestAmountBlock({
    commercialSubtotal: 125,
    amountDue: 130,
    netReceived: 0,
    remainingBalance: 130,
    adjustments: [
      {
        label: "Delivery Processing Fee",
        amount: 5,
        code: DELIVERY_PROCESSING_FEE_CODE,
      },
    ],
  }).includes("Waived"),
);

assert.equal(MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_TITLE, "Delivery fee not set");
assert.equal(
  MISSING_DELIVERY_FEE_BEFORE_CONFIRMATION_BODY,
  "The delivery fee has not been added yet. Add the delivery fee before confirming with the customer, or continue without it if this is intentional.",
);
assert.equal(MISSING_DELIVERY_FEE_ADD_ACTION, "Add Delivery Fee");
assert.equal(
  MISSING_DELIVERY_FEE_CONTINUE_ACTION,
  "Continue Without Delivery Fee",
);
assert.equal(DELIVERY_CHARGES_SECTION_ID, "delivery-charges");
assert.equal(
  deliveryChargesSectionHref("/owner/orders/ord-1"),
  "/owner/orders/ord-1#delivery-charges",
);
assert.equal(
  deliveryChargesSectionHref("/owner/orders/ord-1?returnTo=%2Fowner%2Fcalendar"),
  "/owner/orders/ord-1?returnTo=%2Fowner%2Fcalendar#delivery-charges",
);

// Pickup — no warning; Confirmation still accessible
assert.equal(
  shouldWarnMissingDeliveryFeeBeforeConfirmation({
    fulfilmentMethod: "pickup",
    delivery: null,
  }),
  false,
);
assert.equal(
  canAccessCustomerConfirmation({
    status: "submitted",
    confirmationNeedsResend: false,
  }),
  true,
);

// Delivery + NOT SET — warn; still not a hard Confirmation 404
assert.equal(
  shouldWarnMissingDeliveryFeeBeforeConfirmation({
    fulfilmentMethod: "delivery",
    delivery: delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "not_set",
    }),
  }),
  true,
);
assert.equal(
  canAccessCustomerConfirmation({
    status: "submitted",
    confirmationNeedsResend: false,
  }),
  true,
);

// Delivery + quoted — no warning
assert.equal(
  shouldWarnMissingDeliveryFeeBeforeConfirmation({
    fulfilmentMethod: "delivery",
    delivery: delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
    }),
  }),
  false,
);

// Delivery + waived — NOT “NOT SET”; no warning
assert.equal(
  shouldWarnMissingDeliveryFeeBeforeConfirmation({
    fulfilmentMethod: "delivery",
    delivery: delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted_waived",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: true,
    }),
  }),
  false,
);

// Restored (quoted again) — same as quoted-fee behaviour
assert.equal(
  shouldWarnMissingDeliveryFeeBeforeConfirmation({
    fulfilmentMethod: "delivery",
    delivery: delivery({
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 15,
      deliveryFeeWaived: false,
    }),
  }),
  false,
);

// Finance-disabled historical Delivery — no Delivery Charges, no warning
assert.equal(
  shouldWarnMissingDeliveryFeeBeforeConfirmation({
    fulfilmentMethod: "delivery",
    delivery: delivery({
      financeEnabled: false,
      deliveryFeeStatus: "not_set",
    }),
  }),
  false,
);

{
  const root = resolve(process.cwd());
  const previewPath = resolve(
    root,
    "src/workspaces/owner/orders/ConfirmationPreview.tsx",
  );
  const formPath = resolve(
    root,
    "src/workspaces/owner/orders/OrderWorkspaceForm.tsx",
  );
  const chargesPath = resolve(
    root,
    "src/workspaces/owner/orders/DeliveryChargesSection.tsx",
  );
  const dialogPath = resolve(
    root,
    "src/workspaces/owner/orders/MissingDeliveryFeeConfirmationDialog.tsx",
  );
  const confirmDialogPath = resolve(
    root,
    "src/components/ui/ConfirmDialog.tsx",
  );
  const confirmationPagePath = resolve(
    root,
    "src/app/(app)/owner/orders/[id]/confirmation/page.tsx",
  );
  assert.equal(existsSync(previewPath), true);
  assert.equal(existsSync(formPath), true);
  assert.equal(existsSync(chargesPath), true);
  assert.equal(existsSync(dialogPath), true);

  const previewSrc = readFileSync(previewPath, "utf8");
  const formSrc = readFileSync(formPath, "utf8");
  const chargesSrc = readFileSync(chargesPath, "utf8");
  const dialogSrc = readFileSync(dialogPath, "utf8");
  const confirmDialogSrc = readFileSync(confirmDialogPath, "utf8");
  const pageSrc = readFileSync(confirmationPagePath, "utf8");

  assert.ok(
    previewSrc.includes("shouldWarnMissingDeliveryFeeBeforeConfirmation"),
  );
  assert.ok(previewSrc.includes("confirmationLocked"));
  assert.ok(previewSrc.includes("if (confirmationLocked) return"));
  assert.ok(previewSrc.includes("markConfirmationSentAction"));
  assert.ok(previewSrc.includes("deliveryChargesSectionHref"));
  assert.ok(previewSrc.includes("recordConfirmationPreparedAction"));

  assert.ok(formSrc.includes("handlePrepareConfirmation"));
  assert.ok(formSrc.includes("shouldWarnMissingDeliveryFeeBeforeConfirmation"));
  assert.ok(formSrc.includes("MissingDeliveryFeeConfirmationDialog"));
  assert.ok(formSrc.includes("focusDeliveryChargesSection"));
  assert.ok(formSrc.includes("handlePrepareConfirmation(false)"));
  assert.ok(formSrc.includes("handlePrepareConfirmation(true)"));
  assert.ok(formSrc.includes("<button"));

  assert.ok(chargesSrc.includes("DELIVERY_CHARGES_SECTION_ID"));
  assert.ok(chargesSrc.includes("id={DELIVERY_CHARGES_SECTION_ID}"));

  assert.ok(dialogSrc.includes("allowDismiss={false}"));
  assert.ok(dialogSrc.includes("MISSING_DELIVERY_FEE_ADD_ACTION"));
  assert.ok(dialogSrc.includes("MISSING_DELIVERY_FEE_CONTINUE_ACTION"));
  assert.ok(confirmDialogSrc.includes("allowDismiss"));

  assert.ok(pageSrc.includes("ConfirmationPreview"));
  assert.ok(pageSrc.includes('staff.role.code !== "owner"'));
}

console.log("M4-P3 Slice 3 Confirmation equation tests: PASSED");
