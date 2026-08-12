/**
 * M4-P3 2B-1 — requester attribution display (cross-staff viewers).
 * Run: npx tsx scripts/test-m4-p3-slice2b1-requester-attribution.ts
 */
import assert from "node:assert/strict";
import {
  applyDeliveryFeeRequestStaffNames,
  feeRequestRequesterLabel,
  feeRequestResolverLabel,
  pendingFeeRequestAttentionCopy,
} from "@/engines/orders/delivery-fee-request-attribution";
import {
  buildGuestOrderWorkspaceCapabilities,
  canCancelPendingFeeRequest,
} from "@/engines/orders/delivery-finance-capabilities";
import { defaultDeliveryFinanceDtoFields } from "@/engines/orders/fulfilment";
import type { StorefrontOrder } from "@/types/storefront";

const VIVIAN_ID = "vivian-staff-id";
const PETER_ID = "peter-staff-id";
const OWNER_ID = "owner-staff-id";

function baseOrder(): StorefrontOrder {
  return {
    id: "ord-attr",
    orderNumber: "W2508999",
    status: "submitted",
    customerName: "Amy",
    phone: "012",
    email: "",
    orderSource: "whatsapp",
    crewOrder: false,
    notes: null,
    internalNotes: null,
    pickupDate: "2026-09-12",
    pickupTime: "16:00:00",
    pickupInstruction: null,
    fulfilmentMethod: "delivery",
    collectionId: null,
    includeReceipt: false,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    confirmationNeedsResend: false,
    paymentDeadlineAt: null,
    paymentRequestSentAt: null,
    readyAt: null,
    readyBy: null,
    pickedUpAt: null,
    pickedUpBy: null,
    outForDeliveryAt: null,
    outForDeliveryBy: null,
    deliveredAt: null,
    deliveredBy: null,
    rm10CardIssuanceSuppressed: false,
    rm10CardIssuanceSuppressionCode: null,
    createdAt: "2026-08-11T00:00:00Z",
    items: [],
    complimentaryItems: [],
    paidAddons: [],
    adjustments: [],
    paymentAllocations: [],
    refunds: [],
    settlement: {
      subtotal: 125,
      totalAdjustments: 15,
      amountDue: 140,
      verifiedPaymentsAllocated: 0,
      refundsTotal: 0,
      netReceived: 0,
      remainingBalance: 140,
      overpayment: 0,
      isFullyPaid: false,
    },
    total: 125,
    delivery: {
      recipientName: "Mum",
      recipientPhone: "019",
      addressLine1: "12",
      addressLine2: null,
      postcode: "88400",
      city: "KK",
      state: "Sabah",
      recipientNotifyPreference: "inform_recipient",
      ...defaultDeliveryFinanceDtoFields(),
      financeEnabled: true,
      processingFeeApplicableAmount: 5,
      deliveryFeeStatus: "quoted",
      deliveryFeeQuotedAmount: 10,
      deliveryFeeRequest: {
        status: "pending",
        reason: "VIP",
        quotedAmount: 10,
        requestedBy: VIVIAN_ID,
        requestedByName: null,
        requestedAt: "2026-08-11T10:00:00Z",
        resolvedBy: null,
        resolvedByName: null,
        resolvedAt: null,
        resolutionNote: null,
      },
      processingFeeRequest: {
        kind: "processing_waiver",
        status: "pending",
        proposedAmount: 0,
        reason: "Repeat",
        requestedBy: VIVIAN_ID,
        requestedByName: null,
        requestedAt: "2026-08-11T10:05:00Z",
        resolvedBy: null,
        resolvedByName: null,
        resolvedAt: null,
        resolutionNote: null,
      },
    },
  };
}

const vivianCaps = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: VIVIAN_ID,
});
const peterCaps = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: PETER_ID,
});
const ownerCaps = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: OWNER_ID,
});
const managerCaps = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "manager-staff-id",
});

// Viewer-independent name map (what service-role hydration loads)
const names = new Map([[VIVIAN_ID, "Vivian"]]);

const hydrated = applyDeliveryFeeRequestStaffNames(baseOrder(), names);

assert.equal(hydrated.delivery!.deliveryFeeRequest.requestedByName, "Vivian");
assert.equal(hydrated.delivery!.processingFeeRequest.requestedByName, "Vivian");

// Labels for any viewer use hydrated names — not the viewer identity
assert.equal(
  feeRequestRequesterLabel(
    hydrated.delivery!.deliveryFeeRequest.requestedByName,
  ),
  "Vivian",
);
assert.equal(
  feeRequestRequesterLabel(
    hydrated.delivery!.processingFeeRequest.requestedByName,
  ),
  "Vivian",
);

// Simulate Peter viewing: same hydrated DTO → still Vivian
assert.equal(
  feeRequestRequesterLabel(
    applyDeliveryFeeRequestStaffNames(baseOrder(), names).delivery!
      .deliveryFeeRequest.requestedByName,
  ),
  "Vivian",
);

// Owner viewing
assert.equal(
  feeRequestRequesterLabel(
    applyDeliveryFeeRequestStaffNames(baseOrder(), names).delivery!
      .processingFeeRequest.requestedByName,
  ),
  "Vivian",
);

// Missing name map (legacy / failed lookup) → Staff fallback only
const unhydrated = applyDeliveryFeeRequestStaffNames(baseOrder(), new Map());
assert.equal(unhydrated.delivery!.deliveryFeeRequest.requestedByName, null);
assert.equal(
  feeRequestRequesterLabel(
    unhydrated.delivery!.deliveryFeeRequest.requestedByName,
  ),
  "Staff",
);
assert.equal(feeRequestRequesterLabel(null), "Staff");
assert.equal(feeRequestRequesterLabel("  "), "Staff");
assert.equal(feeRequestRequesterLabel("Vivian"), "Vivian");

// Cancel ownership unchanged — uses staff IDs, not display names
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: vivianCaps,
    requestedBy: VIVIAN_ID,
  }),
  true,
);
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: peterCaps,
    requestedBy: VIVIAN_ID,
  }),
  false,
);
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: ownerCaps,
    requestedBy: VIVIAN_ID,
  }),
  true,
);
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: managerCaps,
    requestedBy: VIVIAN_ID,
  }),
  true,
);

assert.equal(
  feeRequestResolverLabel({ status: "approved", resolvedByName: "Manager" }),
  "Approved by Manager",
);
assert.equal(
  feeRequestResolverLabel({ status: "rejected", resolvedByName: "Owner" }),
  "Rejected by Owner",
);
assert.equal(
  feeRequestResolverLabel({ status: "pending", resolvedByName: "Owner" }),
  null,
);
assert.equal(
  pendingFeeRequestAttentionCopy({
    deliveryPending: true,
    processingPending: false,
  }),
  "Delivery Fee waiver requested — review Delivery Charges below.",
);
assert.equal(
  pendingFeeRequestAttentionCopy({
    deliveryPending: true,
    processingPending: true,
  }),
  "2 fee requests pending — review Delivery Charges below.",
);

console.log("M4-P3 Slice 2B-1 requester attribution tests: PASSED");
