/**
 * M4-P3 Slice 2B-2 — Manager/Owner/CO capability matrix + resolve UX helpers.
 * Run: npx tsx scripts/test-m4-p3-slice2b2-capabilities-ux.ts
 */
import assert from "node:assert/strict";
import { financialMateriallyAffectsConfirmation } from "@/engines/orders/confirmation-validity";
import {
  applyDeliveryFeeRequestStaffNames,
  feeRequestRequesterLabel,
  feeRequestResolverLabel,
  pendingFeeRequestAttentionCopy,
} from "@/engines/orders/delivery-fee-request-attribution";
import {
  buildGuestOrderWorkspaceCapabilities,
  canAccessGuestOrderWorkspace,
  canCancelPendingFeeRequest,
} from "@/engines/orders/delivery-finance-capabilities";
import { defaultDeliveryFinanceDtoFields } from "@/engines/orders/fulfilment";
import type { StorefrontOrder } from "@/types/storefront";

assert.equal(canAccessGuestOrderWorkspace("owner"), true);
assert.equal(canAccessGuestOrderWorkspace("manager"), true);
assert.equal(canAccessGuestOrderWorkspace("customer_operations"), true);
assert.equal(canAccessGuestOrderWorkspace("bakery"), false);

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
  staffId: "vivian-1",
});

assert.equal(owner.canDirectFeeExceptions, true);
assert.equal(owner.canResolveFeeRequests, true);
assert.equal(owner.canRequestFeeExceptions, false);
assert.equal(owner.canEnableDeliveryFinance, true);
assert.equal(owner.canEditOrderWorkspace, true);
assert.equal(owner.canPrepareConfirmation, true);
assert.equal(owner.canManagePayments, true);
assert.equal(owner.canManageDiscounts, true);

assert.equal(manager.canQuoteDeliveryFee, true);
assert.equal(manager.canDirectFeeExceptions, true);
assert.equal(manager.canResolveFeeRequests, true);
assert.equal(manager.canCancelAnyFeeRequest, true);
assert.equal(manager.canRequestFeeExceptions, false);
assert.equal(manager.canEnableDeliveryFinance, false);
assert.equal(manager.canEditOrderWorkspace, true);
assert.equal(manager.canPrepareConfirmation, true);
assert.equal(manager.canManagePayments, true);
assert.equal(manager.canManageDiscounts, true);
assert.equal(manager.canOperateCollectionControls, true);
assert.equal(manager.canManageOrderMessages, true);
assert.equal(manager.canRequestOperationsApproval, false);
assert.equal(manager.canRequestCrossMonthPickupApproval, true);
assert.equal(manager.canAccessOperationsBoard, true);
assert.equal(manager.canOverridePickupMonth, false);
assert.equal(manager.canOverrideDiscountEligibility, false);
assert.equal(manager.canUseOwnerBoardTools, false);
assert.equal(manager.canViewWholeCakeCalendar, true);

assert.equal(counter.canQuoteDeliveryFee, true);
assert.equal(counter.canRequestFeeExceptions, true);
assert.equal(counter.canDirectFeeExceptions, false);
assert.equal(counter.canResolveFeeRequests, false);
assert.equal(counter.canCancelAnyFeeRequest, false);
assert.equal(counter.canEnableDeliveryFinance, false);

assert.equal(
  canCancelPendingFeeRequest({
    capabilities: counter,
    requestedBy: "vivian-1",
  }),
  true,
);
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: counter,
    requestedBy: "peter-1",
  }),
  false,
);
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: manager,
    requestedBy: "vivian-1",
  }),
  true,
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
    deliveryPending: false,
    processingPending: true,
    processingKind: "processing_override",
  }),
  "Processing Fee change requested — review Delivery Charges below.",
);
assert.equal(
  pendingFeeRequestAttentionCopy({
    deliveryPending: false,
    processingPending: true,
    processingKind: "processing_waiver",
  }),
  "Processing Fee waiver requested — review Delivery Charges below.",
);
assert.equal(
  pendingFeeRequestAttentionCopy({
    deliveryPending: true,
    processingPending: true,
  }),
  "2 fee requests pending — review Delivery Charges below.",
);
assert.equal(
  pendingFeeRequestAttentionCopy({
    deliveryPending: false,
    processingPending: false,
  }),
  null,
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
  feeRequestResolverLabel({ status: "cancelled", resolvedByName: "Vivian" }),
  "Cancelled by Vivian",
);

function orderWithRequests(): StorefrontOrder {
  return {
    id: "ord-2b2",
    orderNumber: "W2508900",
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
    createdAt: "2026-08-12T00:00:00Z",
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
        requestedBy: "vivian-1",
        requestedByName: null,
        requestedAt: "2026-08-12T10:00:00Z",
        resolvedBy: null,
        resolvedByName: null,
        resolvedAt: null,
        resolutionNote: null,
      },
      processingFeeRequest: {
        kind: "processing_override",
        status: "pending",
        proposedAmount: 3,
        reason: "Repeat",
        requestedBy: "peter-1",
        requestedByName: null,
        requestedAt: "2026-08-12T10:05:00Z",
        resolvedBy: null,
        resolvedByName: null,
        resolvedAt: null,
        resolutionNote: null,
      },
    },
  };
}

const names = new Map([
  ["vivian-1", "Vivian"],
  ["peter-1", "Peter"],
  ["mgr-1", "Manager"],
]);
const hydrated = applyDeliveryFeeRequestStaffNames(orderWithRequests(), names);
assert.equal(
  feeRequestRequesterLabel(hydrated.delivery!.deliveryFeeRequest.requestedByName),
  "Vivian",
);
assert.equal(
  feeRequestRequesterLabel(
    hydrated.delivery!.processingFeeRequest.requestedByName,
  ),
  "Peter",
);

assert.equal(financialMateriallyAffectsConfirmation(140, 130), true);
assert.equal(financialMateriallyAffectsConfirmation(140, 140), false);

console.log("M4-P3 Slice 2B-2 capabilities/UX helper tests: PASSED");
