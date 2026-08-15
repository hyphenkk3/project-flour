/**
 * Operations board selected-date round trip via URL / returnTo.
 * Run: npx tsx scripts/test-operations-board-return.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_OPERATIONS_QUERY,
  buildOperationsBoardPath,
  parseOperationsBoardSearchParams,
} from "@/engines/operations/order-board";
import {
  ownerOrderWorkspaceHref,
  resolveOwnerReturnTo,
  shouldPropagateOwnerReturnTo,
  withOwnerReturnTo,
} from "@/workspaces/owner/navigation/return-to";
import { withApprovalHistoryReturnPositionFlag } from "@/workspaces/owner/approvals/approval-history-return-position";

const custom16 = parseOperationsBoardSearchParams({ date: "2026-08-16" });
assert.equal(custom16.pickupFilter, "custom");
assert.equal(custom16.customPickupDate, "2026-08-16");
assert.equal(buildOperationsBoardPath(custom16), "/owner?date=2026-08-16");

const custom15 = parseOperationsBoardSearchParams({ date: "2026-08-15" });
assert.equal(buildOperationsBoardPath(custom15), "/owner?date=2026-08-15");

assert.deepEqual(
  parseOperationsBoardSearchParams({}),
  DEFAULT_OPERATIONS_QUERY,
);
assert.equal(buildOperationsBoardPath(DEFAULT_OPERATIONS_QUERY), "/owner");

assert.equal(
  buildOperationsBoardPath({
    ...DEFAULT_OPERATIONS_QUERY,
    pickupFilter: "tomorrow",
  }),
  "/owner?pickup=tomorrow",
);
assert.equal(
  parseOperationsBoardSearchParams({ pickup: "this_week" }).pickupFilter,
  "this_week",
);
assert.equal(
  parseOperationsBoardSearchParams({ date: "16/08/2026" }).pickupFilter,
  "today",
);
assert.equal(
  parseOperationsBoardSearchParams({ date: "2026-02-31" }).customPickupDate,
  null,
);

assert.equal(
  parseOperationsBoardSearchParams({ search: " testdeli " }).search,
  "testdeli",
);
assert.equal(
  buildOperationsBoardPath({
    ...DEFAULT_OPERATIONS_QUERY,
    search: "testdeli",
  }),
  "/owner?search=testdeli",
);
assert.equal(
  resolveOwnerReturnTo("/owner?search=testdeli").href,
  "/owner?search=testdeli",
);
assert.equal(
  ownerOrderWorkspaceHref("ord-1", "/owner?search=testdeli"),
  `/owner/orders/ord-1?returnTo=${encodeURIComponent("/owner?search=testdeli")}`,
);

const from16 = resolveOwnerReturnTo("/owner?date=2026-08-16");
assert.equal(from16.label, "Operations");
assert.equal(from16.href, "/owner?date=2026-08-16");
assert.equal(shouldPropagateOwnerReturnTo(from16), true);

assert.equal(
  resolveOwnerReturnTo("/owner?pickup=custom&date=2026-08-15").href,
  "/owner?date=2026-08-15",
);

const todayReturn = resolveOwnerReturnTo(undefined);
assert.equal(todayReturn.href, "/owner");
assert.equal(todayReturn.label, "Operations");
assert.equal(shouldPropagateOwnerReturnTo(todayReturn), false);
assert.equal(resolveOwnerReturnTo(null).href, "/owner");

assert.equal(resolveOwnerReturnTo("/owner/orders/abc").href, "/owner");
assert.equal(
  resolveOwnerReturnTo("/customer-operations/orders").href,
  "/owner",
);
assert.equal(resolveOwnerReturnTo("/owner/approvals").href, "/owner/approvals");
assert.equal(resolveOwnerReturnTo("/owner/approvals").label, "Approvals");
assert.equal(
  resolveOwnerReturnTo("/owner/approvals/history").href,
  "/owner/approvals/history",
);
assert.equal(
  resolveOwnerReturnTo("/owner/approvals/history").label,
  "Approval History",
);
assert.equal(resolveOwnerReturnTo("/home").href, "/home");
assert.equal(resolveOwnerReturnTo("/home").label, "Home");
assert.equal(shouldPropagateOwnerReturnTo(resolveOwnerReturnTo("/home")), true);
assert.equal(
  ownerOrderWorkspaceHref("ord-1", "/home"),
  `/owner/orders/ord-1?returnTo=${encodeURIComponent("/home")}`,
);
assert.equal(
  resolveOwnerReturnTo("https://example.com/owner?date=2026-08-16").href,
  "/owner",
);

const calendar = resolveOwnerReturnTo(
  "/owner/calendar?year=2026&month=8&view=orders",
);
assert.equal(calendar.label, "Whole Cake Calendar");
assert.match(calendar.href, /^\/owner\/calendar\?/);
assert.equal(shouldPropagateOwnerReturnTo(calendar), true);

assert.equal(
  ownerOrderWorkspaceHref("ord-1", "/owner?date=2026-08-16"),
  `/owner/orders/ord-1?returnTo=${encodeURIComponent("/owner?date=2026-08-16")}`,
);
assert.equal(ownerOrderWorkspaceHref("ord-1"), "/owner/orders/ord-1");
assert.equal(ownerOrderWorkspaceHref("ord-1", "/owner"), "/owner/orders/ord-1");
assert.equal(
  withOwnerReturnTo("/owner/orders/ord-1/payment", "/owner?date=2026-08-16"),
  `/owner/orders/ord-1/payment?returnTo=${encodeURIComponent("/owner?date=2026-08-16")}`,
);
assert.equal(
  ownerOrderWorkspaceHref(
    "ord-1",
    "/owner/calendar?year=2026&month=8&view=orders",
  ),
  `/owner/orders/ord-1?returnTo=${encodeURIComponent(calendar.href)}`,
);

const cardSrc = readFileSync(
  resolve("src/workspaces/owner/orders/OwnerOrderCard.tsx"),
  "utf8",
);
assert.match(cardSrc, /ownerOrderWorkspaceHref\(order\.id, returnTo\)/);

const boardSrc = readFileSync(
  resolve("src/workspaces/owner/OperationsLiveBoard.tsx"),
  "utf8",
);
assert.match(boardSrc, /buildOperationsBoardPath/);
assert.match(boardSrc, /returnTo=\{boardHref\}/);
assert.match(boardSrc, /history\.replaceState/);

const pageSrc = readFileSync(resolve("src/app/(app)/owner/page.tsx"), "utf8");
assert.match(pageSrc, /parseOperationsBoardSearchParams/);

const detailSrc = readFileSync(
  resolve("src/workspaces/owner/OwnerOrderDetail.tsx"),
  "utf8",
);
assert.match(detailSrc, /shouldPropagateOwnerReturnTo/);
assert.match(
  detailSrc,
  /capabilities\.canReviewOperationsApprovals\s*\?\s*"\/owner\/approvals"/,
);
assert.match(detailSrc, /back\.label === "Home"/);
assert.match(detailSrc, /withApprovalHistoryReturnPositionFlag/);
assert.match(detailSrc, /preserveReturnScroll/);

const toolbarSrc = readFileSync(
  resolve("src/workspaces/owner/OperationsBoardToolbar.tsx"),
  "utf8",
);
assert.match(toolbarSrc, /Needs Attention/);
assert.doesNotMatch(toolbarSrc, /Need Attention/);

assert.equal(
  withApprovalHistoryReturnPositionFlag("/owner/approvals/history"),
  "/owner/approvals/history?rp=1",
);
assert.equal(
  withApprovalHistoryReturnPositionFlag("/owner"),
  "/owner",
);

const historyPageSrc = readFileSync(
  resolve("src/app/(app)/owner/approvals/history/page.tsx"),
  "utf8",
);
assert.match(historyPageSrc, /restorePosition/);
assert.match(historyPageSrc, /APPROVAL_HISTORY_RETURN_POSITION_PARAM/);

const historyListSrc = readFileSync(
  resolve("src/workspaces/owner/approvals/OperationsApprovalHistory.tsx"),
  "utf8",
);
assert.match(historyListSrc, /captureApprovalHistoryReturnPosition/);
assert.match(historyListSrc, /takeApprovalHistoryReturnPosition/);

const inboxSrc = readFileSync(
  resolve("src/app/(app)/owner/approvals/page.tsx"),
  "utf8",
);
assert.match(
  inboxSrc,
  /<OperationsApprovalsSection[\s\S]*returnTo="\/owner\/approvals"/,
);
assert.match(inboxSrc, /approvals=\{pendingApprovals\}/);

console.log("PASS operations board selected-date return");
