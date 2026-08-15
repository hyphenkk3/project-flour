/**
 * M4-P3 Slice 2B-1 — capability matrix + pending-request presentation helpers.
 * Run: npx tsx scripts/test-m4-p3-slice2b1-capabilities-ux.ts
 */
import assert from "node:assert/strict";
import {
  buildGuestOrderWorkspaceCapabilities,
  canAccessGuestOrderWorkspace,
  canCancelPendingFeeRequest,
} from "@/engines/orders/delivery-finance-capabilities";
import {
  DELIVERY_FEE_MORE_PRESETS,
  DELIVERY_FEE_PRIMARY_PRESETS,
} from "@/engines/orders/delivery-finance";
import {
  defaultDeliveryFinanceDtoFields,
  mapOrderDeliveryDetails,
} from "@/engines/orders/fulfilment";

assert.deepEqual([...DELIVERY_FEE_PRIMARY_PRESETS], [5, 10, 15]);
assert.deepEqual([...DELIVERY_FEE_MORE_PRESETS], [20, 25, 30]);

assert.equal(canAccessGuestOrderWorkspace("owner"), true);
assert.equal(canAccessGuestOrderWorkspace("customer_operations"), true);
assert.equal(canAccessGuestOrderWorkspace("manager"), true);
assert.equal(canAccessGuestOrderWorkspace("bakery"), false);
assert.equal(canAccessGuestOrderWorkspace("collection"), false);

const owner = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: "owner-1",
});
assert.equal(owner.canEditOrderWorkspace, true);
assert.equal(owner.canDirectFeeExceptions, true);
assert.equal(owner.canRequestFeeExceptions, false);
assert.equal(owner.canResolveFeeRequests, true);
assert.equal(owner.canCancelAnyFeeRequest, true);
assert.equal(owner.canPrepareConfirmation, true);
assert.equal(owner.canManagePayments, true);
assert.equal(owner.canPreparePaymentRequest, true);
assert.equal(owner.canRecordPayment, true);
assert.equal(owner.canManageDiscounts, true);
assert.equal(owner.canOverrideDiscountEligibility, true);
assert.equal(owner.canEditOrderWorkspace, true);
assert.equal(owner.canOverridePickupMonth, true);
assert.equal(owner.canEnableDeliveryFinance, true);

const vivian = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "vivian-1",
});
assert.equal(vivian.canEditOrderWorkspace, true);
assert.equal(vivian.canOverridePickupMonth, false);
assert.equal(vivian.canDirectFeeExceptions, false);
assert.equal(vivian.canRequestFeeExceptions, true);
assert.equal(vivian.canResolveFeeRequests, false);
assert.equal(vivian.canQuoteDeliveryFee, true);
assert.equal(vivian.canCancelAnyFeeRequest, false);
assert.equal(vivian.canPrepareConfirmation, true);
assert.equal(vivian.canPreparePaymentRequest, true);
assert.equal(vivian.canRecordPayment, true);
assert.equal(vivian.canManagePayments, true);
assert.equal(vivian.canExtendPaymentDeadline, false);
assert.equal(vivian.canManageDiscounts, true);
assert.equal(vivian.canOverrideDiscountEligibility, false);
assert.equal(vivian.canEnableDeliveryFinance, false);
assert.equal(vivian.canOperateCollectionControls, true);
assert.equal(vivian.canManageOrderMessages, true);
assert.equal(vivian.canUseOwnerBoardTools, false);
assert.equal(vivian.canViewWholeCakeCalendar, true);

const manager = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
assert.equal(manager.canRequestFeeExceptions, false);
assert.equal(manager.canDirectFeeExceptions, true);
assert.equal(manager.canResolveFeeRequests, true);
assert.equal(manager.canCancelAnyFeeRequest, true);
assert.equal(manager.canQuoteDeliveryFee, true);
assert.equal(manager.canEditOrderWorkspace, true);
assert.equal(manager.canEnableDeliveryFinance, false);
assert.equal(manager.canPrepareConfirmation, true);
assert.equal(manager.canPreparePaymentRequest, true);
assert.equal(manager.canRecordPayment, true);
assert.equal(manager.canManagePayments, true);
assert.equal(manager.canManageDiscounts, true);
assert.equal(manager.canOverrideDiscountEligibility, false);
assert.equal(manager.canOverridePickupMonth, false);
assert.equal(manager.canOperateCollectionControls, true);
assert.equal(manager.canManageOrderMessages, true);
assert.equal(manager.canRequestOperationsApproval, false);
assert.equal(manager.canRequestCrossMonthPickupApproval, true);
assert.equal(manager.canAccessOperationsBoard, true);
assert.equal(manager.canReviewOperationsApprovals, true);
assert.equal(manager.canViewWholeCakeCalendar, true);
assert.equal(manager.canUseOwnerBoardTools, false);

assert.equal(
  canCancelPendingFeeRequest({
    capabilities: vivian,
    requestedBy: "vivian-1",
  }),
  true,
);
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: vivian,
    requestedBy: "peter-1",
  }),
  false,
);
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: owner,
    requestedBy: "vivian-1",
  }),
  true,
);
assert.equal(
  canCancelPendingFeeRequest({
    capabilities: manager,
    requestedBy: "vivian-1",
  }),
  true,
);

const mapped = mapOrderDeliveryDetails({
  recipient_name: "Mum",
  recipient_phone: "019",
  address_line_1: "12",
  address_line_2: null,
  postcode: "88400",
  city: "KK",
  state: "Sabah",
  recipient_notify_preference: "inform_recipient",
  delivery_finance_enabled: true,
  processing_fee_applicable_amount: 5,
  delivery_fee_status: "quoted",
  delivery_fee_quoted_amount: 15,
  delivery_fee_waived: false,
  delivery_fee_request_status: "pending",
  delivery_fee_request_reason: "VIP",
  delivery_fee_request_quoted_amount: 15,
  delivery_fee_requested_by: "vivian-1",
  delivery_fee_requested_at: "2026-08-11T10:00:00Z",
  processing_fee_request_kind: "processing_waiver",
  processing_fee_request_status: "pending",
  processing_fee_request_proposed_amount: 0,
  processing_fee_request_reason: "Repeat",
  processing_fee_requested_by: "vivian-1",
  processing_fee_requested_at: "2026-08-11T10:05:00Z",
});
assert.ok(mapped);
assert.equal(mapped!.deliveryFeeRequest.status, "pending");
assert.equal(mapped!.processingFeeRequest.status, "pending");
assert.equal(mapped!.deliveryFeeRequest.requestedBy, "vivian-1");
assert.equal(mapped!.processingFeeRequest.kind, "processing_waiver");
assert.deepEqual(
  {
    ...defaultDeliveryFinanceDtoFields(),
  }.deliveryFeeRequest.status,
  null,
);

console.log("M4-P3 Slice 2B-1/2B-2 capabilities/UX helper tests: PASSED");
