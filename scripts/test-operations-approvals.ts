/**
 * Operations approval workflow — engine + source contract.
 * Run: npx tsx scripts/test-operations-approvals.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import {
  STALE_APPROVAL_MESSAGE,
  approvalTypeLabel,
  buildOperationsApprovalFingerprint,
  canAccessOperationsApprovalsInbox,
  canCancelOperationsApproval,
  canRequestOperationsApproval,
  canReviewOperationsApprovalType,
  discountExceptionEligibilityReason,
  fingerprintsMatch,
  formatApprovalAge,
  isStaleOperationsApproval,
  isWithinTwoDayChangeCutoff,
  lateOrderEditRestrictionReason,
  parseOperationsApprovalPayload,
  paidAddonsSignatureFromLines,
  projectedAmountDueAfterRm10,
  requesterCannotDecideOwnRequest,
  requiresCrossMonthApproval,
} from "@/engines/operations/approvals";
import { OWNER_ORDER_PAYMENT_SECTION_ID } from "@/engines/operations/owner-attention";

assert.equal(canRequestOperationsApproval("customer_operations"), true);
assert.equal(canRequestOperationsApproval("owner"), false);
assert.equal(canRequestOperationsApproval("manager"), false);
assert.equal(canRequestOperationsApproval("bakery"), false);
assert.equal(canRequestOperationsApproval("collection"), false);

for (const type of [
  "discount_exception",
  "cross_month_pickup",
  "late_order_edit",
] as const) {
  assert.equal(canReviewOperationsApprovalType("owner", type), true);
  assert.equal(canReviewOperationsApprovalType("manager", type), true);
  assert.equal(canReviewOperationsApprovalType("customer_operations", type), false);
  assert.equal(canReviewOperationsApprovalType("bakery", type), false);
  assert.equal(canReviewOperationsApprovalType("collection", type), false);
}

assert.equal(canAccessOperationsApprovalsInbox("owner"), true);
assert.equal(canAccessOperationsApprovalsInbox("manager"), true);
assert.equal(canAccessOperationsApprovalsInbox("customer_operations"), false);

assert.equal(
  requesterCannotDecideOwnRequest({
    actorStaffId: "co-1",
    requestedBy: "co-1",
  }),
  true,
);
assert.equal(
  requesterCannotDecideOwnRequest({
    actorStaffId: "owner-1",
    requestedBy: "co-1",
  }),
  false,
);

assert.equal(
  canCancelOperationsApproval({
    role: "customer_operations",
    staffId: "co-1",
    requestedBy: "co-1",
    status: "pending",
  }),
  true,
);
assert.equal(
  canCancelOperationsApproval({
    role: "customer_operations",
    staffId: "co-1",
    requestedBy: "co-2",
    status: "pending",
  }),
  false,
);
assert.equal(
  canCancelOperationsApproval({
    role: "owner",
    staffId: "owner-1",
    requestedBy: "co-1",
    status: "approved",
  }),
  false,
);

assert.equal(approvalTypeLabel("discount_exception"), "Discount exception");
assert.equal(approvalTypeLabel("cross_month_pickup"), "Cross-month pickup");
assert.equal(approvalTypeLabel("late_order_edit"), "Late order edit");

function sg(isoLocal: string): Date {
  return new Date(isoLocal);
}

const pickupNoon = "2026-08-16";
const atCutoff = sg("2026-08-14T23:59:59+08:00");
const afterCutoff = sg("2026-08-15T00:00:00+08:00");

assert.equal(
  isWithinTwoDayChangeCutoff({ pickupDate: pickupNoon, now: atCutoff }),
  false,
  "14 Aug 23:59:59 — direct edit still allowed",
);
assert.equal(
  isWithinTwoDayChangeCutoff({ pickupDate: pickupNoon, now: afterCutoff }),
  true,
  "15 Aug 00:00 — approval required",
);
// Pickup 16 Aug 12:00 and 16 Aug 21:30 share one calendar date; cutoff ignores time.
assert.equal(
  lateOrderEditRestrictionReason({
    pickupDate: "2026-08-16",
    now: sg("2026-08-14T12:00:00+08:00"),
  }),
  null,
);
assert.equal(
  lateOrderEditRestrictionReason({
    pickupDate: "2026-08-16",
    now: afterCutoff,
  }),
  "This order is within the 2-day change cutoff.",
);

assert.equal(
  isWithinTwoDayChangeCutoff({
    pickupDate: "2026-08-14",
    now: sg("2026-08-14T10:00:00+08:00"),
  }),
  true,
  "same-day pickup requires approval",
);
assert.equal(
  isWithinTwoDayChangeCutoff({
    pickupDate: "2026-08-15",
    now: sg("2026-08-14T10:00:00+08:00"),
  }),
  true,
  "next-day pickup requires approval",
);
assert.equal(
  isWithinTwoDayChangeCutoff({
    pickupDate: "2026-08-16",
    now: sg("2026-08-14T10:00:00+08:00"),
  }),
  false,
  "2-days-away pickup is the cutoff boundary — still direct",
);
assert.equal(
  isWithinTwoDayChangeCutoff({
    pickupDate: "2026-08-17",
    now: sg("2026-08-14T10:00:00+08:00"),
  }),
  false,
  "3+ days away — direct edit",
);
assert.equal(
  isWithinTwoDayChangeCutoff({
    pickupDate: "2026-08-20",
    now: sg("2026-08-18T23:59:59+08:00"),
  }),
  false,
);
assert.equal(
  isWithinTwoDayChangeCutoff({
    pickupDate: "2026-08-20",
    now: sg("2026-08-19T00:00:00+08:00"),
  }),
  true,
);

assert.equal(
  requiresCrossMonthApproval({
    currentPickupDate: "2026-08-20",
    proposedPickupDate: "2026-09-03",
  }),
  true,
);
assert.equal(
  requiresCrossMonthApproval({
    currentPickupDate: "2026-08-20",
    proposedPickupDate: "2026-08-28",
  }),
  false,
);

const validVoucher = discountExceptionEligibilityReason({
  items: [{ sizeLabel: '6"' }],
  orderDate: "2026-08-01",
  pickupDate: "2026-08-20",
  expiryDate: "2026-08-31",
  hasAugustPromo: false,
  hasRm10Card: false,
});
assert.equal(validVoucher.canRequest, false, "valid voucher is direct path");

const expired = discountExceptionEligibilityReason({
  items: [{ sizeLabel: '6"' }],
  orderDate: "2026-08-01",
  pickupDate: "2026-08-20",
  expiryDate: "2026-08-10",
  hasAugustPromo: false,
  hasRm10Card: false,
});
assert.equal(expired.canRequest, true);
assert.match(expired.reason ?? "", /Pickup date is after voucher expiry/);

const wrongSize = discountExceptionEligibilityReason({
  items: [{ sizeLabel: '10"' }],
  orderDate: "2026-08-01",
  pickupDate: "2026-08-20",
  expiryDate: "2026-08-10",
  hasAugustPromo: false,
  hasRm10Card: false,
});
assert.equal(wrongSize.canRequest, false, "size ineligibility is not overridable");

assert.equal(projectedAmountDueAfterRm10({ currentAmountDue: 125, action: "redeem_rm10" }), 115);
assert.equal(
  projectedAmountDueAfterRm10({
    currentAmountDue: 105,
    action: "change_august_to_rm10",
  }),
  115,
);

const stored = buildOperationsApprovalFingerprint({
  pickupDate: "2026-08-20",
  pickupTime: "16:00:00",
  status: "submitted",
  hasRm10: false,
  hasAugust: false,
  items: [{ cakeId: "c1", cakeSizeId: "s1", quantity: 1 }],
});
const same = buildOperationsApprovalFingerprint({
  pickupDate: "2026-08-20",
  pickupTime: "16:00",
  status: "submitted",
  hasRm10: false,
  hasAugust: false,
  items: [{ cakeId: "c1", cakeSizeId: "s1", quantity: 1 }],
});
assert.equal(fingerprintsMatch(stored, same, "cross_month_pickup"), true);
assert.equal(
  isStaleOperationsApproval({
    requestType: "late_order_edit",
    stored,
    current: same,
  }),
  false,
  "time passing / cutoff passing does not expire a matching fingerprint",
);

const pickupChanged = buildOperationsApprovalFingerprint({
  pickupDate: "2026-08-21",
  pickupTime: stored.pickupTime,
  status: stored.status,
  hasRm10: false,
  hasAugust: false,
  items: [{ cakeId: "c1", cakeSizeId: "s1", quantity: 1 }],
});
assert.equal(
  isStaleOperationsApproval({
    requestType: "cross_month_pickup",
    stored,
    current: pickupChanged,
  }),
  true,
);

const rm10Applied = buildOperationsApprovalFingerprint({
  pickupDate: stored.pickupDate,
  pickupTime: stored.pickupTime,
  status: stored.status,
  hasRm10: true,
  hasAugust: false,
  items: [{ cakeId: "c1", cakeSizeId: "s1", quantity: 1 }],
});
assert.equal(
  isStaleOperationsApproval({
    requestType: "discount_exception",
    stored,
    current: rm10Applied,
  }),
  true,
);

const itemsChanged = buildOperationsApprovalFingerprint({
  pickupDate: stored.pickupDate,
  pickupTime: stored.pickupTime,
  status: stored.status,
  hasRm10: false,
  hasAugust: false,
  items: [{ cakeId: "c1", cakeSizeId: "s2", quantity: 1 }],
});
assert.equal(
  isStaleOperationsApproval({
    requestType: "late_order_edit",
    stored,
    current: itemsChanged,
  }),
  true,
);

const addonsUnchanged = buildOperationsApprovalFingerprint({
  pickupDate: stored.pickupDate,
  pickupTime: stored.pickupTime,
  status: stored.status,
  hasRm10: false,
  hasAugust: false,
  items: [{ cakeId: "c1", cakeSizeId: "s1", quantity: 1 }],
  paidAddons: [],
});
assert.equal(
  isStaleOperationsApproval({
    requestType: "late_order_edit",
    stored,
    current: addonsUnchanged,
  }),
  false,
  "empty paid add-ons match the default fingerprint signature",
);

const addonsChanged = buildOperationsApprovalFingerprint({
  pickupDate: stored.pickupDate,
  pickupTime: stored.pickupTime,
  status: stored.status,
  hasRm10: false,
  hasAugust: false,
  items: [{ cakeId: "c1", cakeSizeId: "s1", quantity: 1 }],
  paidAddons: [{ code: "birthday_card", quantity: 1, messages: [null] }],
});
assert.equal(
  isStaleOperationsApproval({
    requestType: "late_order_edit",
    stored,
    current: addonsChanged,
  }),
  true,
  "paid add-on change stales late_order_edit",
);
assert.notEqual(
  paidAddonsSignatureFromLines([]),
  paidAddonsSignatureFromLines([
    { code: "birthday_card", quantity: 1, messages: [null] },
  ]),
);

const parsedLate = parseOperationsApprovalPayload("late_order_edit", {
  kind: "late_order_edit",
  current: {
    pickup_date: "2026-08-15",
    pickup_time: "13:00",
    items: [
      {
        cake_id: "c1",
        cake_size_id: "s1",
        quantity: 1,
        unit_price: 125,
        cake_name: "Chocolate D'Amour",
        size_label: '6"',
      },
    ],
    paid_addons: [],
  },
  proposed: {
    pickup_date: "2026-08-15",
    pickup_time: "13:00",
    items: [
      {
        cake_id: "c1",
        cake_size_id: "s1",
        quantity: 1,
        unit_price: 125,
        cake_name: "Chocolate D'Amour",
        size_label: '6"',
      },
    ],
    paid_addons: [
      {
        code: "birthday_card",
        name: "Birthday Card",
        quantity: 1,
        messages: [null],
      },
    ],
  },
});
assert.equal(parsedLate?.kind, "late_order_edit");
if (parsedLate?.kind === "late_order_edit") {
  assert.equal(parsedLate.proposed.paidAddons?.[0]?.code, "birthday_card");
  assert.equal(parsedLate.proposed.paidAddons?.[0]?.name, "Birthday Card");
  assert.equal(parsedLate.current?.paidAddons?.length, 0);
}

const parsed = parseOperationsApprovalPayload("discount_exception", {
  action: "redeem_rm10",
  voucher_number: "325",
  expiry_date: "2026-08-10",
  eligibility_reason: "Pickup date is after voucher expiry",
  current_amount_due: 125,
  requested_amount_due: 115,
});
assert.equal(parsed?.kind, "discount_exception");
if (parsed?.kind === "discount_exception") {
  assert.equal(parsed.voucherNumber, "325");
  assert.equal(parsed.requestedAmountDue, 115);
}

assert.match(formatApprovalAge(new Date().toISOString()), /just now|min ago/);
assert.equal(STALE_APPROVAL_MESSAGE.includes("stale"), true);

const co = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co-1",
});
assert.equal(co.canRequestOperationsApproval, true);
assert.equal(co.canReviewOperationsApprovals, false);
assert.equal(co.canOverridePickupMonth, false);
assert.equal(co.canOverrideDiscountEligibility, false);
assert.equal(co.canAccessOperationsBoard, true);

const owner = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: "owner-1",
});
assert.equal(owner.canRequestOperationsApproval, false);
assert.equal(owner.canReviewOperationsApprovals, true);

const manager = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
assert.equal(manager.canAccessOperationsBoard, false);
assert.equal(manager.canReviewOperationsApprovals, true);
assert.equal(manager.canEditOrderWorkspace, false);
assert.equal(manager.canResolveFeeRequests, true);
assert.equal(manager.canUseOwnerBoardTools, false);
assert.equal(manager.canViewWholeCakeCalendar, false);
const managerNav = getNavigationForRole("manager").map((item) => item.id);
assert.ok(!managerNav.includes("owner"), "Manager does not get Operations nav");
assert.ok(!managerNav.includes("owner_calendar"));

const bakery = buildGuestOrderWorkspaceCapabilities({
  role: "bakery",
  staffId: "bakery-1",
});
assert.equal(bakery.canRequestOperationsApproval, false);
assert.equal(bakery.canReviewOperationsApprovals, false);

const collection = buildGuestOrderWorkspaceCapabilities({
  role: "collection",
  staffId: "col-1",
});
assert.equal(collection.canRequestOperationsApproval, false);
assert.equal(collection.canReviewOperationsApprovals, false);

const migration = readFileSync(
  resolve("supabase/migrations/20260814150000_operations_approval_requests.sql"),
  "utf8",
);
assert.match(migration, /create table if not exists public.operations_approval_requests/);
assert.match(migration, /discount_exception/);
assert.match(migration, /late_order_edit/);
assert.match(migration, /cross_month_pickup/);
assert.match(migration, /create_operations_approval_request/);
assert.match(migration, /approve_operations_approval_request/);
assert.match(migration, /reject_operations_approval_request/);
assert.match(migration, /cancel_operations_approval_request/);
assert.match(migration, /Requester cannot approve or reject their own request/);
assert.match(migration, /This approval request is stale/);
assert.match(migration, /p_role in \('owner', 'manager'\)/);
assert.match(migration, /singapore_calendar_date/);
assert.match(migration, /2-day change cutoff/);
assert.match(migration, /Cross-month pickup must use the cross-month approval type/);
assert.doesNotMatch(
  migration,
  /create or replace function public.redeem_rm10_physical_voucher_for_guest_order/,
);
assert.doesNotMatch(
  migration,
  /create or replace function public.change_august_promo_to_rm10_physical_voucher/,
);
assert.match(
  migration,
  /public\.redeem_rm10_physical_voucher_for_guest_order/,
  "approve executes existing RM10 RPC, does not replace it",
);
assert.doesNotMatch(migration, /mark_guest_order_picked_up/);
assert.doesNotMatch(migration, /order_delivery_details/);

const addonMigration = readFileSync(
  resolve("supabase/migrations/20260814170000_late_order_edit_paid_addons.sql"),
  "utf8",
);
assert.match(addonMigration, /sync_guest_order_paid_addons/);
assert.match(addonMigration, /paid_addons_signature/);
assert.match(addonMigration, /_operations_approval_paid_addons_snapshot/);
assert.doesNotMatch(addonMigration, /mark_guest_order_picked_up/);
assert.doesNotMatch(
  addonMigration,
  /create or replace function public.redeem_rm10_physical_voucher_for_guest_order/,
);
assert.match(
  addonMigration,
  /v_role is distinct from 'customer_operations'/,
  "create authority unchanged",
);
assert.match(
  addonMigration,
  /_operations_approval_can_review/,
  "approve still uses existing review helper",
);
{
  const approveIdx = addonMigration.indexOf(
    "create or replace function public.approve_operations_approval_request",
  );
  const addonSyncIdx = addonMigration.indexOf(
    "perform public.sync_guest_order_paid_addons",
  );
  const approvedIdx = addonMigration.indexOf("status = 'approved'");
  assert.ok(approveIdx > 0 && addonSyncIdx > approveIdx, "approve RPC syncs paid add-ons");
  assert.ok(
    addonSyncIdx < approvedIdx,
    "paid-add-on sync runs before the request is marked approved",
  );
  assert.doesNotMatch(
    addonMigration.slice(approveIdx),
    /exception when others/i,
    "approve must not swallow add-on execution errors",
  );
}

const rm10Migration = readFileSync(
  resolve(
    "supabase/migrations/20260814160000_rm10_valid_path_customer_operations.sql",
  ),
  "utf8",
);
/** Mirrors `_rm10_redemption_actor_allowed` — source-level matrix only. */
function rm10RedemptionActorAllowed(
  role: string,
  ownerOverride: boolean,
): boolean {
  return ownerOverride
    ? role === "owner" || role === "manager"
    : role === "owner" || role === "manager" || role === "customer_operations";
}

const rm10Roles = [
  "owner",
  "manager",
  "customer_operations",
  "bakery",
  "collection",
] as const;
assert.deepEqual(
  rm10Roles.map((role) => rm10RedemptionActorAllowed(role, false)),
  [true, true, true, false, false],
  "normal eligible: owner | manager | CO",
);
assert.deepEqual(
  rm10Roles.map((role) => rm10RedemptionActorAllowed(role, true)),
  [true, true, false, false, false],
  "override: owner | manager only; CO cannot forge override",
);

assert.match(rm10Migration, /_rm10_redemption_actor_allowed/);
assert.match(
  rm10Migration,
  /then p_role in \('owner', 'manager'\)/,
  "override path: owner | manager only",
);
assert.match(
  rm10Migration,
  /else p_role in \('owner', 'manager', 'customer_operations'\)/,
  "valid path: owner | manager | customer_operations",
);
assert.doesNotMatch(
  rm10Migration,
  /then p_role in \([^)]*customer_operations/,
  "CO must not be on the override allowlist",
);
assert.doesNotMatch(rm10Migration, /p_role in \([^)]*'bakery'/);
assert.doesNotMatch(rm10Migration, /p_role in \([^)]*'collection'/);
assert.match(rm10Migration, /Do NOT apply automatically/);
assert.doesNotMatch(rm10Migration, /create table/i);
assert.doesNotMatch(rm10Migration, /mark_guest_order_picked_up/);

const collectionMigration = readFileSync(
  resolve(
    "supabase/migrations/20260814140000_collection_customer_operations_picked_up.sql",
  ),
  "utf8",
);
assert.match(
  collectionMigration,
  /v_role not in \('owner', 'manager', 'collection', 'customer_operations'\)/,
);

const discountPanel = readFileSync(
  resolve("src/workspaces/owner/orders/OrderDiscountsPanel.tsx"),
  "utf8",
);
assert.match(discountPanel, /Request Approval/);
assert.match(discountPanel, /Voucher cannot be applied automatically/);

const workspaceForm = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);
assert.match(workspaceForm, /This pickup date requires higher-authority approval/);
assert.match(workspaceForm, /Late-change approval required/);
assert.match(workspaceForm, /late_order_edit/);
assert.match(workspaceForm, /lateOrderEditRestrictionReason/);

const saveSrc = readFileSync(
  resolve("src/workspaces/owner/orders/actions.ts"),
  "utf8",
);
assert.match(saveSrc, /isWithinTwoDayChangeCutoff/);
assert.match(saveSrc, /customer_operations/);

const paymentSrc = readFileSync(
  resolve("src/workspaces/owner/orders/PaymentSection.tsx"),
  "utf8",
);
assert.match(paymentSrc, /id=\{OWNER_ORDER_PAYMENT_SECTION_ID\}/);
assert.match(paymentSrc, /scroll-mt-24/);
assert.equal(OWNER_ORDER_PAYMENT_SECTION_ID, "owner-order-payment");

const boardSrc = readFileSync(
  resolve("src/workspaces/owner/OperationsLiveBoard.tsx"),
  "utf8",
);
assert.match(boardSrc, /OperationsApprovalsSection/);

const approvalsPage = readFileSync(
  resolve("src/app/(app)/owner/approvals/page.tsx"),
  "utf8",
);
assert.match(approvalsPage, /canAccessOperationsApprovalsInbox/);
assert.match(approvalsPage, /listPendingOperationsApprovals/);

const feeActions = readFileSync(
  resolve("src/workspaces/owner/orders/actions.ts"),
  "utf8",
);
assert.match(feeActions, /resolve_guest_order_delivery_fee_request/);
assert.match(feeActions, /requireOwnerOrManager/);

console.log("PASS  operations approval engine + source contract");
