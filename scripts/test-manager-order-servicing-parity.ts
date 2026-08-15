/**
 * Manager customer/order servicing parity + operational VIEW access + cutoff.
 * Run: npx tsx scripts/test-manager-order-servicing-parity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isWithinTwoDayChangeCutoff,
  lateOrderEditRestrictionReason,
} from "@/engines/operations/approvals";
import {
  buildGuestOrderWorkspaceCapabilities,
  canAccessOperationsBoard,
  canViewWholeCakeCalendar,
} from "@/engines/orders/delivery-finance-capabilities";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { getNavigationForRole } from "@/foundation/navigation/workspaces";

const owner = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: "owner-1",
});
const manager = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
const vivian = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "vivian-1",
});

// ---------------------------------------------------------------------------
// Capability matrix — Manager matches Vivian on routine servicing + board/calendar VIEW
// ---------------------------------------------------------------------------
for (const flag of [
  "canEditOrderWorkspace",
  "canManageOrderMessages",
  "canOperateCollectionControls",
  "canPrepareConfirmation",
  "canPreparePaymentRequest",
  "canRecordPayment",
  "canManagePayments",
  "canManageDiscounts",
  "canAccessOperationsBoard",
  "canViewWholeCakeCalendar",
] as const) {
  assert.equal(manager[flag], true, `Manager ${flag}`);
  assert.equal(vivian[flag], true, `Vivian ${flag}`);
  assert.equal(owner[flag], true, `Owner ${flag}`);
}

assert.equal(canAccessOperationsBoard("manager"), true);
assert.equal(canViewWholeCakeCalendar("manager"), true);
assert.equal(canAccessWorkspace("manager", "owner"), true);
assert.equal(canAccessWorkspace("manager", "owner_calendar"), true);

// ---------------------------------------------------------------------------
// Navigation — Manager includes Operations + Whole Cake Calendar
// ---------------------------------------------------------------------------
const managerNav = getNavigationForRole("manager").map((item) => item.id);
assert.ok(managerNav.includes("owner"), "Manager Operations nav");
assert.ok(managerNav.includes("owner_calendar"), "Manager Calendar nav");
assert.ok(managerNav.includes("customer_operations"));
assert.ok(managerNav.includes("bakery"));
assert.ok(managerNav.includes("collection"));
assert.ok(managerNav.includes("library"));

const vivianNav = getNavigationForRole("customer_operations").map((i) => i.id);
assert.ok(vivianNav.includes("owner"));
assert.ok(vivianNav.includes("owner_calendar"));
assert.ok(vivianNav.includes("customer_operations"));
assert.ok(!vivianNav.includes("bakery"));

const ownerNav = getNavigationForRole("owner").map((i) => i.id);
assert.equal(ownerNav[0], "home");
assert.ok(ownerNav.includes("owner"));
assert.ok(ownerNav.includes("owner_calendar"));

// ---------------------------------------------------------------------------
// VIEW vs MUTATION — Manager view without Owner-only mutations
// ---------------------------------------------------------------------------
assert.equal(manager.canUseOwnerBoardTools, false);
assert.equal(manager.canRequestOperationsApproval, false);
assert.equal(manager.canRequestCrossMonthPickupApproval, true);
assert.equal(manager.canOverridePickupMonth, false);
assert.equal(manager.canOverrideDiscountEligibility, false);
assert.equal(manager.canEnableDeliveryFinance, false);
assert.equal(manager.canExtendPaymentDeadline, false);
assert.equal(manager.canReviewOperationsApprovals, true);

assert.equal(vivian.canRequestOperationsApproval, true);
assert.equal(vivian.canRequestCrossMonthPickupApproval, true);
assert.equal(vivian.canReviewOperationsApprovals, false);
assert.equal(vivian.canUseOwnerBoardTools, false);
assert.equal(owner.canOverridePickupMonth, true);
assert.equal(owner.canOverrideDiscountEligibility, true);
assert.equal(owner.canUseOwnerBoardTools, true);
assert.equal(owner.canAccessOperationsBoard, true);
assert.equal(owner.canViewWholeCakeCalendar, true);

// Calendar Quick View: Manager can operate routine actions; Owner-only mutations stay Owner.
const calendarPage = readFileSync(
  resolve("src/workspaces/owner/calendar/WholeCakeCalendarPage.tsx"),
  "utf8",
);
assert.match(calendarPage, /canViewWholeCakeCalendar/);
assert.match(
  calendarPage,
  /canOperateOrderActions = capabilities\.canOperateCollectionControls/,
);
assert.match(
  calendarPage,
  /canManageOrderMessages = capabilities\.canManageOrderMessages/,
);
assert.match(
  calendarPage,
  /canMutateCalendarOrderActions = capabilities\.role === "owner"/,
);
assert.match(calendarPage, /canMarkReady = capabilities\.role === "owner"/);

const ownerDashboard = readFileSync(
  resolve("src/workspaces/owner/OwnerDashboard.tsx"),
  "utf8",
);
assert.match(
  ownerDashboard,
  /showOwnerBoardTools=\{capabilities\.canUseOwnerBoardTools\}/,
);

const ownerBoardPage = readFileSync(
  resolve("src/app/(app)/owner/page.tsx"),
  "utf8",
);
assert.match(ownerBoardPage, /canAccessOperationsBoard/);
assert.doesNotMatch(
  ownerBoardPage,
  /manager" \? "\/owner\/approvals"/,
  "Manager is not redirected away from Operations to approvals-only",
);

// ---------------------------------------------------------------------------
// Cutoff engine — D−1 / D−0 within cutoff; outside not
// ---------------------------------------------------------------------------
function sg(isoLocal: string): Date {
  return new Date(isoLocal);
}

const pickup = "2026-08-20";
const outside = sg("2026-08-17T12:00:00+08:00");
const dMinus1 = sg("2026-08-19T12:00:00+08:00");
const dMinus0 = sg("2026-08-20T09:00:00+08:00");

assert.equal(
  isWithinTwoDayChangeCutoff({ pickupDate: pickup, now: outside }),
  false,
);
assert.equal(
  isWithinTwoDayChangeCutoff({ pickupDate: pickup, now: dMinus1 }),
  true,
);
assert.equal(
  isWithinTwoDayChangeCutoff({ pickupDate: pickup, now: dMinus0 }),
  true,
);
assert.ok(lateOrderEditRestrictionReason({ pickupDate: pickup, now: dMinus1 }));

/** UI blockDirectSave mirrors OrderWorkspaceForm: CO approval flag ∧ cutoff. */
function wouldBlockDirectSave(roleCaps: typeof manager, now: Date): boolean {
  return (
    roleCaps.canRequestOperationsApproval &&
    isWithinTwoDayChangeCutoff({ pickupDate: pickup, now })
  );
}

assert.equal(wouldBlockDirectSave(manager, outside), false, "Manager outside");
assert.equal(wouldBlockDirectSave(manager, dMinus1), false, "Manager D−1 direct");
assert.equal(wouldBlockDirectSave(manager, dMinus0), false, "Manager D−0 direct");
assert.equal(wouldBlockDirectSave(vivian, outside), false, "CO outside");
assert.equal(wouldBlockDirectSave(vivian, dMinus1), true, "CO D−1 approval");
assert.equal(wouldBlockDirectSave(vivian, dMinus0), true, "CO D−0 approval");
assert.equal(wouldBlockDirectSave(owner, dMinus1), false, "Owner D−1 direct");
assert.equal(wouldBlockDirectSave(owner, dMinus0), false, "Owner D−0 direct");

// ---------------------------------------------------------------------------
// Server authorization — Manager on routine action paths; Ready stays Owner
// ---------------------------------------------------------------------------
const actionsSrc = readFileSync(
  resolve("src/workspaces/owner/orders/actions.ts"),
  "utf8",
);
assert.match(
  actionsSrc,
  /staff\.role\.code !== "owner" &&\s*staff\.role\.code !== "manager" &&\s*staff\.role\.code !== "customer_operations"/,
);
assert.match(
  actionsSrc,
  /staff\.role\.code === "customer_operations" &&\s*isWithinTwoDayChangeCutoff/,
);
assert.doesNotMatch(
  actionsSrc,
  /staff\.role\.code === "manager" &&\s*isWithinTwoDayChangeCutoff/,
);

for (const fn of [
  "saveOrderWorkspaceAction",
  "recordAndVerifyPaymentAction",
  "markOrderPickedUpAction",
  "undoOrderPickedUpAction",
  "markOrderOutForDeliveryAction",
  "undoOrderOutForDeliveryAction",
  "markOrderDeliveredAction",
  "undoOrderDeliveredAction",
] as const) {
  assert.match(
    actionsSrc,
    new RegExp(
      `export async function ${fn}[\\s\\S]*?requireOwnerOrCustomerOperations`,
    ),
  );
}
assert.match(
  actionsSrc,
  /export async function markOrderReadyAction[\s\S]*?requireOwner\(\)/,
);
assert.match(
  actionsSrc,
  /export async function undoOrderReadyAction[\s\S]*?requireOwner\(\)/,
);

const workspaceForm = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);
assert.match(
  workspaceForm,
  /blockDirectSave =\s*capabilities\.canRequestOperationsApproval && lateChangeRequired/,
);
assert.match(workspaceForm, /canMarkReady=\{capabilities\.role === "owner"\}/);
assert.match(workspaceForm, /canRequestCrossMonthPickupApproval/);
assert.match(workspaceForm, /Request Approval to change the pickup month/);

const paymentPage = readFileSync(
  resolve("src/app/(app)/owner/orders/[id]/payment/page.tsx"),
  "utf8",
);
assert.match(paymentPage, /canPreparePaymentRequest/);

const confirmationPage = readFileSync(
  resolve("src/app/(app)/owner/orders/[id]/confirmation/page.tsx"),
  "utf8",
);
assert.match(confirmationPage, /canPrepareConfirmation/);

console.log("Manager order servicing parity: PASS");
