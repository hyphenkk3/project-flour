/**
 * Approval discoverability, history read-model, and pending-block UX.
 * Run: npx tsx scripts/test-approval-discoverability.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildApprovalChangeSummary } from "@/engines/operations/approval-change-summary";
import {
  canAccessOperationsApprovalsInbox,
  canCancelOperationsApproval,
  canRequestOperationsApproval,
  canRequestOperationsApprovalType,
  canReviewOperationsApprovalType,
  type LateOrderEditPayload,
  type OperationsApprovalFingerprint,
  type OperationsApprovalPayload,
  type OperationsApprovalRecord,
  type OperationsApprovalStatus,
  type OperationsApprovalType,
} from "@/engines/operations/approvals";
import {
  CANCEL_PENDING_APPROVAL_LABEL,
  DEFAULT_APPROVAL_HISTORY_FILTERS,
  LATE_ORDER_EDIT_APPROVAL_SCOPE_EXCLUSIONS,
  LATE_ORDER_EDIT_APPROVAL_SCOPE_SUMMARY,
  LATE_ORDER_EDIT_SECTION_EXCLUDED,
  LATE_ORDER_EDIT_SECTION_INCLUDED,
  LATE_ORDER_EDIT_SECTION_PICKUP_INCLUDED,
  OPERATIONS_APPROVALS_SECTION_ID,
  OPERATIONS_APPROVAL_HISTORY_PATH,
  PENDING_LATE_EDIT_ALREADY_BODY,
  PENDING_LATE_EDIT_ALREADY_TITLE,
  VIEW_PENDING_APPROVAL_LABEL,
  approvalHistoryRowFromRecord,
  approvalPanelDomId,
  canAccessOperationsApprovalHistory,
  filterOperationsApprovalHistory,
  formatApprovalActorLabel,
  homePendingApprovalsHref,
  operationsApprovalsSectionHref,
  pendingApprovalsLabel,
  pendingLateOrderEdit,
  pendingOperationsApprovalCount,
  viewPendingApprovalHref,
  visibleDecidedApprovalsForOrder,
} from "@/engines/operations/approval-ux";

const fingerprint: OperationsApprovalFingerprint = {
  pickupDate: "2026-08-15",
  pickupTime: "13:00:00",
  status: "pending_confirmation",
  hasRm10: false,
  hasAugust: false,
  itemsSignature: "cake",
  paidAddonsSignature: "",
};

function latePayload(partial?: {
  currentQty?: number;
  proposedQty?: number;
}): LateOrderEditPayload {
  const currentQty = partial?.currentQty ?? 1;
  const proposedQty = partial?.proposedQty ?? 2;
  const item = {
    cakeId: "c1",
    cakeSizeId: "s6",
    quantity: currentQty,
    unitPrice: 125,
    cakeName: "Chocolate D'Amour",
    sizeLabel: '6"',
  };
  return {
    kind: "late_order_edit",
    current: {
      pickupDate: "2026-08-15",
      pickupTime: "13:00:00",
      items: [{ ...item, quantity: currentQty }],
      paidAddons: [
        { code: "birthday_card", name: "Birthday Card", quantity: 2, messages: [null, null] },
      ],
    },
    proposed: {
      items: [{ ...item, quantity: proposedQty }],
      paidAddons: [
        { code: "birthday_card", name: "Birthday Card", quantity: 2, messages: [null, null] },
      ],
    },
  };
}

function record(input: {
  id: string;
  status: OperationsApprovalStatus;
  requestType?: OperationsApprovalType;
  customerName?: string;
  orderNumber?: string;
  payload?: OperationsApprovalPayload;
  requestedBy?: string;
  requestedByName?: string;
  requestedByRoleName?: string | null;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedByRoleName?: string | null;
  reviewedAt?: string | null;
  reason?: string;
  createdAt?: string;
}): OperationsApprovalRecord {
  return {
    id: input.id,
    orderId: `order-${input.id}`,
    orderNumber: input.orderNumber ?? `WB-${input.id}`,
    customerName: input.customerName ?? "Guest",
    pickupDate: "2026-08-15",
    pickupTime: "13:00:00",
    requestType: input.requestType ?? "late_order_edit",
    status: input.status,
    reason: input.reason ?? "customer asked",
    payload: input.payload ?? latePayload(),
    orderFingerprint: fingerprint,
    requestedBy: input.requestedBy ?? "co-1",
    requestedByName: input.requestedByName ?? "Vivian",
    requestedByRoleName:
      input.requestedByRoleName === undefined
        ? "Customer Operations"
        : input.requestedByRoleName,
    reviewedBy: input.reviewedBy ?? null,
    reviewedByName: input.reviewedByName ?? null,
    reviewedByRoleName: input.reviewedByRoleName ?? null,
    reviewedAt: input.reviewedAt ?? null,
    reviewerNote: null,
    createdAt: input.createdAt ?? "2026-08-14T12:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-08-14T12:00:00.000Z",
  };
}

const pending = record({ id: "p1", status: "pending" });
const approved = record({
  id: "a1",
  status: "approved",
  customerName: "Amy",
  orderNumber: "WB-AMY",
  requestedByName: "Vivian",
  requestedByRoleName: "Customer Operations",
  reviewedBy: "owner-1",
  reviewedByName: "Owner (Dev)",
  reviewedByRoleName: "Owner",
  reviewedAt: "2026-08-14T13:00:00.000Z",
  payload: latePayload({ currentQty: 1, proposedQty: 2 }),
});
const rejected = record({
  id: "r1",
  status: "rejected",
  requestType: "discount_exception",
  customerName: "Marcus",
  payload: {
    kind: "discount_exception",
    action: "redeem_rm10",
    voucherNumber: "1234",
    expiryDate: "2026-08-01",
    eligibilityReason: "expired",
    currentAmountDue: 125,
    requestedAmountDue: 115,
  },
  reviewedBy: "mgr-1",
  reviewedByName: "Manager",
  reviewedAt: "2026-08-14T14:00:00.000Z",
});
const cancelled = record({
  id: "c1",
  status: "cancelled",
  requestType: "cross_month_pickup",
  customerName: "Lily",
  payload: {
    kind: "cross_month_pickup",
    currentPickupDate: "2026-08-15",
    currentPickupTime: "13:00",
    proposedPickupDate: "2026-09-02",
    proposedPickupTime: "14:00",
    fulfilmentMethod: "pickup",
  },
  reviewedBy: "co-1",
  reviewedByName: "Vivian",
  reviewedAt: "2026-08-14T15:00:00.000Z",
});

assert.equal(pendingOperationsApprovalCount([pending, approved, rejected]), 1);
assert.equal(pendingOperationsApprovalCount([approved, cancelled]), 0);
assert.equal(pendingOperationsApprovalCount([]), 0);
assert.equal(pendingApprovalsLabel(1), "Approval Pending");
assert.equal(pendingApprovalsLabel(2), "Approvals Pending");
assert.equal(OPERATIONS_APPROVALS_SECTION_ID, "operations-approvals");
assert.equal(operationsApprovalsSectionHref(), "#operations-approvals");

assert.equal(pendingLateOrderEdit([pending, approved])?.id, "p1");
assert.equal(pendingLateOrderEdit([approved, cancelled]), null);
assert.equal(
  viewPendingApprovalHref("order-p1", "p1"),
  "/owner/orders/order-p1?approval=p1",
);
assert.equal(approvalPanelDomId("p1"), "approval-p1");

assert.equal(PENDING_LATE_EDIT_ALREADY_TITLE, "Approval already pending");
assert.match(PENDING_LATE_EDIT_ALREADY_BODY, /pending late-change approval/);
assert.match(PENDING_LATE_EDIT_ALREADY_BODY, /Review or cancel/);
assert.equal(VIEW_PENDING_APPROVAL_LABEL, "View pending approval");
assert.equal(CANCEL_PENDING_APPROVAL_LABEL, "Cancel pending approval");

const historyAll = filterOperationsApprovalHistory(
  [pending, approved, rejected, cancelled],
  DEFAULT_APPROVAL_HISTORY_FILTERS,
);
assert.equal(historyAll.length, 4);

const approvedOnly = filterOperationsApprovalHistory(
  [pending, approved, rejected, cancelled],
  { ...DEFAULT_APPROVAL_HISTORY_FILTERS, status: "approved" },
);
assert.deepEqual(
  approvedOnly.map((row) => row.id),
  ["a1"],
);

const rejectedOnly = filterOperationsApprovalHistory(
  [pending, approved, rejected, cancelled],
  { ...DEFAULT_APPROVAL_HISTORY_FILTERS, status: "rejected" },
);
assert.deepEqual(
  rejectedOnly.map((row) => row.id),
  ["r1"],
);

const cancelledOnly = filterOperationsApprovalHistory(
  [pending, approved, rejected, cancelled],
  { ...DEFAULT_APPROVAL_HISTORY_FILTERS, status: "cancelled" },
);
assert.deepEqual(
  cancelledOnly.map((row) => row.id),
  ["c1"],
);

const lateOnly = filterOperationsApprovalHistory(
  [pending, approved, rejected, cancelled],
  { ...DEFAULT_APPROVAL_HISTORY_FILTERS, requestType: "late_order_edit" },
);
assert.deepEqual(
  lateOnly.map((row) => row.id).sort(),
  ["a1", "p1"],
);

const searchAmy = filterOperationsApprovalHistory(
  [pending, approved, rejected, cancelled],
  { ...DEFAULT_APPROVAL_HISTORY_FILTERS, search: "amy" },
);
assert.deepEqual(
  searchAmy.map((row) => row.id),
  ["a1"],
);
const searchOrder = filterOperationsApprovalHistory(
  [pending, approved, rejected, cancelled],
  { ...DEFAULT_APPROVAL_HISTORY_FILTERS, search: "WB-AMY" },
);
assert.equal(searchOrder[0]?.id, "a1");

const approvedRow = approvalHistoryRowFromRecord(
  approved,
  OPERATIONS_APPROVAL_HISTORY_PATH,
);
assert.equal(approvedRow.status, "approved");
assert.equal(approvedRow.statusLabel, "Approved");
assert.equal(approvedRow.requestedByLabel, "Vivian · Customer Operations");
assert.equal(approvedRow.requestedByName, "Vivian · Customer Operations");
assert.equal(approvedRow.requestedAt, "2026-08-14T12:00:00.000Z");
assert.equal(approvedRow.reviewedByLabel, "Owner (Dev)");
assert.equal(approvedRow.reviewedByName, "Owner (Dev)");
assert.equal(approvedRow.reviewedAt, "2026-08-14T13:00:00.000Z");
assert.equal(approvedRow.reason, "customer asked");
assert.deepEqual(
  approvedRow.changeSummaryLines,
  buildApprovalChangeSummary(approved.payload).lines,
);
assert.deepEqual(
  approvedRow.changeLines,
  buildApprovalChangeSummary(approved.payload).changeLines,
);
assert.match(approvedRow.changeSummaryLines.join("\n"), /×1 → ×2/);
assert.doesNotMatch(approvedRow.changeSummaryLines.join("\n"), /Birthday Card/);
assert.match(approvedRow.href, /\/owner\/orders\/order-a1\?approval=a1/);
assert.match(approvedRow.href, /returnTo=/);

assert.equal(
  formatApprovalActorLabel({
    name: "Vivian",
    roleName: "Customer Operations",
  }),
  "Vivian · Customer Operations",
);
assert.equal(
  formatApprovalActorLabel({ name: null }),
  "Staff",
);
assert.equal(
  formatApprovalActorLabel({
    name: "Owner (Dev)",
    roleName: "Owner",
    includeRole: false,
  }),
  "Owner (Dev)",
);

const rejectedRow = approvalHistoryRowFromRecord(rejected);
assert.equal(rejectedRow.status, "rejected");
assert.equal(rejectedRow.reviewedByLabel, "Manager");
assert.match(rejectedRow.changeSummaryLines.join(" "), /RM10/);

const cancelledRow = approvalHistoryRowFromRecord(cancelled);
assert.equal(cancelledRow.status, "cancelled");
assert.equal(cancelledRow.reviewedByLabel, "Vivian");
assert.equal(cancelledRow.reviewedAt, "2026-08-14T15:00:00.000Z");

assert.equal(canAccessOperationsApprovalHistory("owner"), true);
assert.equal(canAccessOperationsApprovalHistory("manager"), true);
assert.equal(canAccessOperationsApprovalHistory("customer_operations"), true);
assert.equal(canAccessOperationsApprovalHistory("bakery"), false);
assert.equal(canAccessOperationsApprovalHistory("collection"), false);
assert.equal(canAccessOperationsApprovalsInbox("customer_operations"), false);
assert.equal(canAccessOperationsApprovalsInbox("owner"), true);
assert.equal(canAccessOperationsApprovalsInbox("manager"), true);

assert.equal(canRequestOperationsApproval("customer_operations"), true);
assert.equal(canRequestOperationsApproval("owner"), false);
assert.equal(
  canRequestOperationsApprovalType("manager", "cross_month_pickup"),
  true,
);
assert.equal(
  canRequestOperationsApprovalType("manager", "late_order_edit"),
  false,
);
assert.equal(homePendingApprovalsHref("owner"), "/owner/approvals");
assert.equal(homePendingApprovalsHref("manager"), "/owner/approvals");
assert.equal(
  homePendingApprovalsHref("customer_operations"),
  "/owner?pickup=today#operations-approvals",
);
assert.equal(canReviewOperationsApprovalType("owner", "late_order_edit"), true);
assert.equal(
  canReviewOperationsApprovalType("customer_operations", "late_order_edit"),
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
    staffId: "co-2",
    requestedBy: "co-1",
    status: "pending",
  }),
  false,
);
assert.equal(
  canCancelOperationsApproval({
    role: "owner",
    staffId: "owner-1",
    requestedBy: "co-1",
    status: "pending",
  }),
  true,
);
assert.equal(
  canCancelOperationsApproval({
    role: "customer_operations",
    staffId: "co-1",
    requestedBy: "co-1",
    status: "approved",
  }),
  false,
);

assert.equal(
  pendingLateOrderEdit([
    record({ id: "old", status: "cancelled" }),
    record({ id: "fresh", status: "pending" }),
  ])?.id,
  "fresh",
  "after cancel, a new pending late_order_edit can exist under existing uniqueness",
);

const toolbar = readFileSync(
  resolve("src/workspaces/owner/OperationsBoardToolbar.tsx"),
  "utf8",
);
assert.match(toolbar, /pendingApprovalCount/);
assert.match(toolbar, /OPERATIONS_APPROVALS_SECTION_ID/);
assert.match(toolbar, /pendingApprovalsLabel/);
assert.match(toolbar, /scrollWorkspaceSectionIntoView/);

const board = readFileSync(
  resolve("src/workspaces/owner/OperationsLiveBoard.tsx"),
  "utf8",
);
assert.match(board, /pendingOperationsApprovalCount\(pendingApprovals\)/);
assert.match(board, /OPERATIONS_APPROVALS_SECTION_ID/);
assert.match(
  board,
  /window\.location\.hash !== `#\$\{OPERATIONS_APPROVALS_SECTION_ID\}`/,
);

const section = readFileSync(
  resolve("src/workspaces/owner/approvals/OperationsApprovalsSection.tsx"),
  "utf8",
);
assert.match(section, /id=\{OPERATIONS_APPROVALS_SECTION_ID\}/);
assert.match(section, /OPERATIONS_APPROVAL_HISTORY_PATH/);
assert.match(section, /Approval History/);

const historyUi = readFileSync(
  resolve("src/workspaces/owner/approvals/OperationsApprovalHistory.tsx"),
  "utf8",
);
assert.match(historyUi, /ApprovalChangeLines/);
assert.match(historyUi, /requestedByLabel/);
assert.match(historyUi, /filterOperationsApprovalHistory/);
assert.match(historyUi, /All statuses/);
assert.match(historyUi, /All types/);

const panel = readFileSync(
  resolve("src/workspaces/owner/approvals/OrderApprovalPanel.tsx"),
  "utf8",
);
assert.match(panel, /formatApprovalActorLabel/);
assert.match(panel, /ApprovalChangeLines/);
assert.match(panel, /requestedByRoleName/);

const queries = readFileSync(
  resolve("src/workspaces/owner/approvals/queries.ts"),
  "utf8",
);
assert.match(queries, /createServiceClient/);
assert.match(queries, /roles!inner/);
assert.match(queries, /Staff can read own profile/);
assert.match(queries, /requestedByRoleName/);

const historyPage = readFileSync(
  resolve("src/app/(app)/owner/approvals/history/page.tsx"),
  "utf8",
);
assert.match(historyPage, /listOperationsApprovals/);
assert.match(historyPage, /canAccessOperationsApprovalHistory/);
assert.doesNotMatch(historyPage, /create_operations_approval_request/);

const notice = readFileSync(
  resolve("src/workspaces/owner/approvals/PendingLateOrderEditNotice.tsx"),
  "utf8",
);
assert.match(notice, /PENDING_LATE_EDIT_ALREADY_TITLE/);
assert.match(notice, /VIEW_PENDING_APPROVAL_LABEL/);
assert.match(notice, /CANCEL_PENDING_APPROVAL_LABEL/);
assert.match(notice, /cancelOperationsApprovalAction/);
assert.match(notice, /approvalPanelDomId/);
assert.doesNotMatch(notice, /createOperationsApprovalAction/);

const workspace = readFileSync(
  resolve("src/workspaces/owner/orders/OrderWorkspaceForm.tsx"),
  "utf8",
);
assert.match(workspace, /PendingLateOrderEditNotice/);
assert.match(workspace, /pendingLateEdit \?/);
assert.match(workspace, /canCancelOperationsApproval/);
assert.match(workspace, /visibleDecidedApprovalsForOrder/);
assert.match(workspace, /LATE_ORDER_EDIT_APPROVAL_SCOPE_SUMMARY/);
assert.match(workspace, /editPickupTime/);
assert.match(workspace, /lateEditScopeHint/);
assert.match(workspace, /lateEditCutoffHints=\{blockDirectSave\}/);
assert.ok(LATE_ORDER_EDIT_APPROVAL_SCOPE_SUMMARY.includes("cake items"));
assert.ok(LATE_ORDER_EDIT_APPROVAL_SCOPE_SUMMARY.includes("paid add-ons"));
assert.ok(LATE_ORDER_EDIT_APPROVAL_SCOPE_SUMMARY.includes("pickup date/time"));
assert.ok(
  LATE_ORDER_EDIT_APPROVAL_SCOPE_EXCLUSIONS.includes("Customer details"),
);
assert.ok(
  LATE_ORDER_EDIT_APPROVAL_SCOPE_EXCLUSIONS.includes("fulfilment method"),
);
assert.equal(
  LATE_ORDER_EDIT_SECTION_INCLUDED,
  "Changes here can be requested for approval.",
);
assert.equal(
  LATE_ORDER_EDIT_SECTION_PICKUP_INCLUDED,
  "Same-month pickup date/time changes can be requested for approval.",
);
assert.equal(
  LATE_ORDER_EDIT_SECTION_EXCLUDED,
  "Not included in late-change approval — ask Owner if this needs updating.",
);
assert.doesNotMatch(workspace, /guest_name.*late_order_edit/);
assert.doesNotMatch(
  readFileSync(resolve("src/engines/operations/approvals.ts"), "utf8"),
  /proposedGuestName|proposedNotes|proposedComplimentary/,
);

{
  const decided = [
    record({ id: "d1", status: "approved", createdAt: "2026-08-15T10:00:00.000Z" }),
    record({ id: "d2", status: "rejected", createdAt: "2026-08-14T10:00:00.000Z" }),
    record({ id: "d3", status: "cancelled", createdAt: "2026-08-13T10:00:00.000Z" }),
    record({ id: "d4", status: "approved", createdAt: "2026-08-12T10:00:00.000Z" }),
    record({ id: "d5", status: "approved", createdAt: "2026-08-11T10:00:00.000Z" }),
    record({ id: "d6", status: "rejected", createdAt: "2026-08-10T10:00:00.000Z" }),
  ];
  const latestFive = visibleDecidedApprovalsForOrder(decided, null);
  assert.deepEqual(
    latestFive.map((row) => row.id),
    ["d1", "d2", "d3", "d4", "d5"],
  );
  assert.deepEqual(
    visibleDecidedApprovalsForOrder(decided, "d2").map((row) => row.id),
    ["d1", "d2", "d3", "d4", "d5"],
  );
  assert.deepEqual(
    visibleDecidedApprovalsForOrder(decided, "d6").map((row) => row.id),
    ["d1", "d2", "d3", "d4", "d5", "d6"],
  );
  assert.deepEqual(
    visibleDecidedApprovalsForOrder(decided, "missing").map((row) => row.id),
    ["d1", "d2", "d3", "d4", "d5"],
  );
}

const engine = readFileSync(
  resolve("src/engines/operations/approvals.ts"),
  "utf8",
);
assert.match(engine, /canCancelOperationsApproval/);
assert.match(engine, /canRequestOperationsApproval/);
assert.doesNotMatch(engine, /PENDING_LATE_EDIT_ALREADY_TITLE/);

const migration = readFileSync(
  resolve("supabase/migrations/20260814150000_operations_approval_requests.sql"),
  "utf8",
);
assert.match(
  migration,
  /create unique index if not exists operations_approval_requests_one_pending/,
);
assert.match(
  migration,
  /on public\.operations_approval_requests \(order_id, request_type\)/,
);

console.log("PASS  approval discoverability + history read-model");
