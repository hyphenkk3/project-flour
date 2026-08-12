/**
 * M4-P2 Slice 1 — DTO / fulfilment mapping (app truth).
 * Run: npx tsx scripts/test-m4-p2-slice1-fulfilment-dto.ts
 */
import assert from "node:assert/strict";
import {
  mapOrderDeliveryDetails,
  normalizeFulfilmentMethod,
  normalizeRecipientNotifyPreference,
} from "@/engines/orders/fulfilment";
import {
  calculateCakeSubtotal,
  calculateCommercialSubtotal,
  commercialLinesForSettlement,
} from "@/engines/orders/totals";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { evaluateAugustPromoEligibility } from "@/engines/orders/promotions";
import { normalizePaidAddonLines } from "@/engines/orders/totals";

// Missing historical method → pickup
assert.equal(normalizeFulfilmentMethod(undefined), "pickup");
assert.equal(normalizeFulfilmentMethod(null), "pickup");
assert.equal(normalizeFulfilmentMethod(""), "pickup");
assert.equal(normalizeFulfilmentMethod("pickup"), "pickup");
assert.equal(normalizeFulfilmentMethod("delivery"), "delivery");
assert.equal(normalizeFulfilmentMethod("drive_through"), "drive_through");

assert.equal(
  normalizeRecipientNotifyPreference("inform_recipient"),
  "inform_recipient",
);
assert.equal(
  normalizeRecipientNotifyPreference("do_not_inform_recipient"),
  "do_not_inform_recipient",
);
assert.equal(normalizeRecipientNotifyPreference("nope"), null);

// Pickup delivery = null mapping path
assert.equal(mapOrderDeliveryDetails(null), null);
assert.equal(mapOrderDeliveryDetails(undefined), null);

const deliveryMapped = mapOrderDeliveryDetails({
  recipient_name: " Amy ",
  recipient_phone: " 0123456789 ",
  address_line_1: " 12 Jalan Test ",
  address_line_2: "  ",
  postcode: "50450",
  city: "Kuala Lumpur",
  state: "Wilayah Persekutuan",
  recipient_notify_preference: "inform_recipient",
});
assert.deepEqual(deliveryMapped, {
  recipientName: "Amy",
  recipientPhone: "0123456789",
  addressLine1: "12 Jalan Test",
  addressLine2: null,
  postcode: "50450",
  city: "Kuala Lumpur",
  state: "Wilayah Persekutuan",
  recipientNotifyPreference: "inform_recipient",
  financeEnabled: false,
  processingFeeApplicableAmount: null,
  processingFeeOverrideAmount: null,
  processingFeeWaived: false,
  deliveryFeeStatus: "not_set",
  deliveryFeeQuotedAmount: null,
  deliveryFeeWaived: false,
  deliveryFeeRequest: {
    status: null,
    reason: null,
    quotedAmount: null,
    requestedBy: null,
    requestedByName: null,
    requestedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedAt: null,
    resolutionNote: null,
  },
  processingFeeRequest: {
    kind: null,
    status: null,
    proposedAmount: null,
    reason: null,
    requestedBy: null,
    requestedByName: null,
    requestedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedAt: null,
    resolutionNote: null,
  },
});

const doNotInform = mapOrderDeliveryDetails({
  recipient_name: "Bob",
  recipient_phone: "011",
  address_line_1: "1 Road",
  address_line_2: "Unit 2",
  postcode: "10000",
  city: "Ipoh",
  state: "Perak",
  recipient_notify_preference: "do_not_inform_recipient",
});
assert.equal(doNotInform?.recipientNotifyPreference, "do_not_inform_recipient");
assert.equal(doNotInform?.addressLine2, "Unit 2");

// Incomplete Delivery row → null DTO (method stays delivery at mapOrder layer)
assert.equal(
  mapOrderDeliveryDetails({
    recipient_name: "Amy",
    recipient_phone: "",
    address_line_1: "12 Jalan",
    address_line_2: null,
    postcode: "50450",
    city: "KL",
    state: "WP",
    recipient_notify_preference: "inform_recipient",
  }),
  null,
);

// Financial non-regression — Delivery is not a commercial line
const cakes = [{ unitPrice: 125, quantity: 1 }];
const addons = [{ unitPrice: 3, quantity: 1 }];
assert.equal(calculateCakeSubtotal(cakes), 125);
assert.equal(
  calculateCommercialSubtotal({ items: cakes, paidAddons: addons }),
  128,
);
assert.deepEqual(normalizePaidAddonLines(undefined), []);
const settled = calculateOrderSettlement({
  items: commercialLinesForSettlement({ items: cakes, paidAddons: addons }),
  adjustments: [],
  allocations: [],
  refunds: [],
});
assert.equal(settled.subtotal, 128);
assert.equal(settled.amountDue, 128);

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

console.log("M4-P2 Slice 1 fulfilment-dto tests: PASSED");
