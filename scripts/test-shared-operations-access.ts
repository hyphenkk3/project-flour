/**
 * Shared Operations access — Customer Operations normal preorder operators.
 * Run: npx tsx scripts/test-shared-operations-access.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildGuestOrderWorkspaceCapabilities,
  canAccessGuestOrderWorkspace,
  canAccessOperationsBoard,
  canViewWholeCakeCalendar,
} from "@/engines/orders/delivery-finance-capabilities";
import {
  buildCollectionWorkspaceCapabilities,
  canAccessCollectionWorkspace,
} from "@/engines/collection/capabilities";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { deriveOwnerAttention } from "@/engines/operations/owner-attention";
import { OWNER_ORDER_PAYMENT_SECTION_ID } from "@/engines/operations/owner-attention";

assert.equal(canAccessOperationsBoard("owner"), true);
assert.equal(canAccessOperationsBoard("customer_operations"), true);
assert.equal(canAccessOperationsBoard("manager"), false);
assert.equal(canAccessOperationsBoard("bakery"), false);

assert.equal(canViewWholeCakeCalendar("owner"), true);
assert.equal(canViewWholeCakeCalendar("customer_operations"), true);
assert.equal(canViewWholeCakeCalendar("manager"), false);
assert.equal(canViewWholeCakeCalendar("bakery"), false);

assert.equal(canAccessCollectionWorkspace("customer_operations"), true);
assert.equal(canAccessCollectionWorkspace("bakery"), false);
assert.equal(canAccessCollectionWorkspace("collection"), true);

assert.equal(canAccessGuestOrderWorkspace("customer_operations"), true);

const coNav = getNavigationForRole("customer_operations").map((i) => i.id);
assert.deepEqual(coNav, [
  "home",
  "owner",
  "customer_operations",
  "owner_calendar",
  "collection",
]);
assert.ok(!coNav.includes("bakery"));

assert.equal(canAccessWorkspace("customer_operations", "owner"), true);
assert.equal(canAccessWorkspace("customer_operations", "owner_calendar"), true);
assert.equal(canAccessWorkspace("customer_operations", "collection"), true);
assert.equal(canAccessWorkspace("bakery", "owner"), false);
assert.equal(canAccessWorkspace("bakery", "collection"), false);

const owner = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: "owner-1",
});
assert.equal(owner.canEditOrderWorkspace, true);
assert.equal(owner.canOverridePickupMonth, true);
assert.equal(owner.canManageDiscounts, true);
assert.equal(owner.canOverrideDiscountEligibility, true);
assert.equal(owner.canUseOwnerBoardTools, true);
assert.equal(owner.canRequestOperationsApproval, false);
assert.equal(owner.canReviewOperationsApprovals, true);
assert.equal(owner.canManageOrderMessages, true);
assert.equal(owner.canOperateCollectionControls, true);
assert.equal(owner.canViewWholeCakeCalendar, true);

const co = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co-1",
});
assert.equal(co.canAccessOperationsBoard, true);
assert.equal(co.canRequestOperationsApproval, true);
assert.equal(co.canReviewOperationsApprovals, false);
assert.equal(co.canEditOrderWorkspace, true);
assert.equal(co.canOverridePickupMonth, false, "CO cannot self-override month");
assert.equal(co.canManageDiscounts, true);
assert.equal(co.canOverrideDiscountEligibility, false);
assert.equal(co.canPrepareConfirmation, true);
assert.equal(co.canPreparePaymentRequest, true);
assert.equal(co.canRecordPayment, true);
assert.equal(co.canExtendPaymentDeadline, false);
assert.equal(co.canResolveFeeRequests, false);
assert.equal(co.canUseOwnerBoardTools, false);
assert.equal(co.canManageOrderMessages, false);
assert.equal(co.canOperateCollectionControls, false);
assert.equal(co.canViewWholeCakeCalendar, true);
assert.equal(co.canEnableDeliveryFinance, false);

const manager = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
assert.equal(manager.canAccessOperationsBoard, false);
assert.equal(manager.canReviewOperationsApprovals, true);
assert.equal(manager.canEditOrderWorkspace, false);
assert.equal(manager.canManageDiscounts, false);
assert.equal(manager.canResolveFeeRequests, true);
assert.equal(manager.canViewWholeCakeCalendar, false);

const bakery = buildGuestOrderWorkspaceCapabilities({
  role: "bakery",
  staffId: "bakery-1",
});
assert.equal(bakery.canAccessOperationsBoard, false);
assert.equal(bakery.canRecordPayment, false);

const coCollection = buildCollectionWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co-1",
});
assert.equal(coCollection.canAccessCollectionWorkspace, true);
assert.equal(coCollection.canMarkCollected, true);
assert.equal(coCollection.canUndoCollected, true);

const bakeryCollection = buildCollectionWorkspaceCapabilities({
  role: "bakery",
  staffId: "bakery-1",
});
assert.equal(bakeryCollection.canAccessCollectionWorkspace, false);

const coExtra = buildExtraWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co-1",
});
assert.equal(coExtra.canProposeExtra, false);
assert.equal(coExtra.canConfirmExtra, false);
assert.equal(coExtra.canAccessExtraSurface, false);

// Attention — single helper
assert.deepEqual(
  deriveOwnerAttention({
    status: "submitted",
    confirmationNeedsResend: false,
    fulfilmentMethod: "pickup",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
  }).map((r) => r.key),
  ["prepare_confirmation"],
);

// Go to Payment target stability
assert.equal(OWNER_ORDER_PAYMENT_SECTION_ID, "owner-order-payment");
const paymentSrc = readFileSync(
  resolve("src/workspaces/owner/orders/PaymentSection.tsx"),
  "utf8",
);
assert.match(paymentSrc, /id=\{OWNER_ORDER_PAYMENT_SECTION_ID\}/);
assert.match(paymentSrc, /scroll-mt-24/);
const attentionSrc = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceAttentionBlock.tsx"),
  "utf8",
);
assert.match(attentionSrc, /scrollWorkspaceSectionIntoView/);
assert.match(attentionSrc, /OWNER_ORDER_PAYMENT_SECTION_ID/);

const actionsSrc = readFileSync(
  resolve("src/workspaces/owner/orders/actions.ts"),
  "utf8",
);
assert.match(
  actionsSrc,
  /export async function saveOrderWorkspaceAction[\s\S]*?requireOwnerOrCustomerOperations/,
);
assert.match(
  actionsSrc,
  /Cross-month pickup changes require Owner override/,
);
assert.match(
  actionsSrc,
  /export async function applyAugustPromoAction[\s\S]*?requireOwnerOrCustomerOperations/,
);
assert.match(
  actionsSrc,
  /export async function redeemRm10VoucherAction[\s\S]*?Owner override for invalid vouchers is Owner-only/,
);
assert.match(
  actionsSrc,
  /export async function recordAndVerifyPaymentAction[\s\S]*?requireOwnerOrCustomerOperations/,
);

const calendarActionsSrc = readFileSync(
  resolve("src/workspaces/owner/calendar/actions.ts"),
  "utf8",
);
assert.match(calendarActionsSrc, /canViewWholeCakeCalendar/);
assert.match(calendarActionsSrc, /requireCalendarViewer/);

// Collection RPC allowlist — latest migration includes customer_operations
const rpcMigration = readFileSync(
  resolve(
    "supabase/migrations/20260814140000_collection_customer_operations_picked_up.sql",
  ),
  "utf8",
);
assert.match(
  rpcMigration,
  /v_role not in \('owner', 'manager', 'collection', 'customer_operations'\)/,
);
assert.match(rpcMigration, /create or replace function public\.mark_guest_order_picked_up/);
assert.match(rpcMigration, /create or replace function public\.undo_guest_order_picked_up/);
// Narrow: no bakery, no new columns/lifecycle
assert.doesNotMatch(rpcMigration, /'bakery'/);
assert.doesNotMatch(rpcMigration, /alter table/i);
assert.doesNotMatch(rpcMigration, /create table/i);

console.log("Shared Operations access: PASS");
