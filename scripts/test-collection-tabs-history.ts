/**
 * Collection tabs — Ready / Pickup / Delivery / Dine-In / Completed / History.
 * Run: npx tsx scripts/test-collection-tabs-history.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCollectionWorkspaceCapabilities,
  canAccessCollectionWorkspace,
} from "@/engines/collection/capabilities";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import {
  COLLECTION_HISTORY_LOOKBACK_DAYS,
  isActiveOnCollectionBoard,
  isActiveOnCollectionDeliveryBoard,
  isActiveOnCollectionReadyQueue,
  isCompletedCollectionHandoff,
  isCompletedInCollectionHistory,
  isCompletedOnCollectionBoard,
  parseCollectionBoardTab,
  sortCollectionCompletedOrdersDesc,
} from "@/workspaces/collection/eligibility";
import {
  collectionDateNavHref,
  collectionOrderHref,
} from "@/workspaces/collection/date";

const day = "2026-10-23";
const readyPickup = {
  customerId: null as string | null,
  pickupDate: day,
  selectedPickupDate: day,
  status: "paid",
  fulfilmentMethod: "pickup",
  readyAt: "2026-10-23T01:00:00Z",
  pickedUpAt: null as string | null,
  deliveredAt: null as string | null,
};

assert.equal(parseCollectionBoardTab(undefined), "ready");
assert.equal(parseCollectionBoardTab("completed"), "completed");
assert.equal(parseCollectionBoardTab("history"), "history");
assert.equal(parseCollectionBoardTab("pickup"), "pickup");
assert.equal(parseCollectionBoardTab("delivery"), "delivery");
assert.equal(parseCollectionBoardTab("dine_in"), "dine_in");
assert.equal(parseCollectionBoardTab("nope"), "ready");

// Pickup focused queue
assert.equal(isActiveOnCollectionBoard(readyPickup), true);
assert.equal(
  isActiveOnCollectionReadyQueue(readyPickup),
  true,
  "Pickup-ready appears in Ready",
);

const readyDelivery = {
  ...readyPickup,
  fulfilmentMethod: "delivery" as const,
};
assert.equal(isActiveOnCollectionDeliveryBoard(readyDelivery), true);
assert.equal(
  isActiveOnCollectionReadyQueue(readyDelivery),
  true,
  "Delivery-ready appears in Ready",
);
assert.equal(
  isActiveOnCollectionBoard(readyDelivery),
  false,
  "Delivery-ready does not appear in Pickup",
);
assert.equal(
  isActiveOnCollectionDeliveryBoard(readyPickup),
  false,
  "Pickup-ready does not appear in Delivery",
);

// Completed must not appear as Ready / Pickup
const pickedUp = {
  ...readyPickup,
  pickedUpAt: "2026-10-23T04:00:00Z",
};
assert.equal(isActiveOnCollectionBoard(pickedUp), false);
assert.equal(isActiveOnCollectionReadyQueue(pickedUp), false);
assert.equal(
  isCompletedOnCollectionBoard({
    ...pickedUp,
    deliveredAt: null,
  }),
  true,
);

const delivered = {
  customerId: null as string | null,
  pickupDate: day,
  selectedPickupDate: day,
  status: "paid",
  fulfilmentMethod: "delivery",
  readyAt: "2026-10-23T01:00:00Z",
  pickedUpAt: null as string | null,
  deliveredAt: "2026-10-23T05:00:00Z",
};
assert.equal(isActiveOnCollectionBoard(delivered as typeof readyPickup), false);
assert.equal(isActiveOnCollectionDeliveryBoard(delivered), false);
assert.equal(isActiveOnCollectionReadyQueue(delivered), false);
assert.equal(isCompletedOnCollectionBoard(delivered), true);
assert.equal(
  isCompletedCollectionHandoff(delivered),
  true,
  "Delivered appears in completed handoffs",
);

// Delivery not yet delivered — not completed
assert.equal(
  isCompletedOnCollectionBoard({
    ...delivered,
    deliveredAt: null,
  }),
  false,
);

// History includes both; newest first; lookback window
assert.equal(COLLECTION_HISTORY_LOOKBACK_DAYS, 30);
assert.equal(
  isCompletedInCollectionHistory({
    ...pickedUp,
    deliveredAt: null,
    rangeStart: "2026-09-23",
    rangeEnd: day,
  }),
  true,
);
assert.equal(
  isCompletedInCollectionHistory({
    ...delivered,
    rangeStart: "2026-09-23",
    rangeEnd: day,
  }),
  true,
);
assert.equal(
  isCompletedInCollectionHistory({
    ...pickedUp,
    deliveredAt: null,
    pickupDate: "2026-09-01",
    rangeStart: "2026-09-23",
    rangeEnd: day,
  }),
  false,
  "Outside lookback excluded",
);

const sorted = sortCollectionCompletedOrdersDesc([
  {
    fulfilmentMethod: "pickup",
    pickedUpAt: "2026-10-23T03:00:00Z",
    deliveredAt: null,
    orderNumber: "WB-1",
  },
  {
    fulfilmentMethod: "delivery",
    pickedUpAt: null,
    deliveredAt: "2026-10-23T06:00:00Z",
    orderNumber: "WB-2",
  },
  {
    fulfilmentMethod: "pickup",
    pickedUpAt: "2026-10-23T05:30:00Z",
    deliveredAt: null,
    orderNumber: "WB-3",
  },
]);
assert.deepEqual(
  sorted.map((row) => row.orderNumber),
  ["WB-2", "WB-3", "WB-1"],
  "Newest completed handoffs first",
);

// Manager / Vivian / Owner can view Collection
for (const role of [
  "manager",
  "customer_operations",
  "owner",
  "collection",
] as const) {
  assert.equal(canAccessCollectionWorkspace(role), true, `${role} access`);
  const caps = buildCollectionWorkspaceCapabilities({
    role,
    staffId: `${role}-1`,
  });
  assert.equal(caps.canAccessCollectionWorkspace, true);
  assert.equal(caps.canMarkCollected, true, `${role} Mark Collected`);
}

// Owner-only mutation controls remain protected (not Collection desk)
const managerOps = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
const vivianOps = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "vivian-1",
});
assert.equal(managerOps.canUseOwnerBoardTools, false);
assert.equal(managerOps.canOverrideDiscountEligibility, false);
assert.equal(managerOps.canOverridePickupMonth, false);
assert.equal(vivianOps.canUseOwnerBoardTools, false);
assert.equal(vivianOps.canOverrideDiscountEligibility, false);

// Source wiring — tabs + queries
const pageSrc = readFileSync(
  resolve("src/app/(app)/collection/page.tsx"),
  "utf8",
);
assert.match(pageSrc, /parseCollectionBoardTab/);
assert.match(pageSrc, /listCollectionOrdersForTab/);

const navSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionWorkspaceNav.tsx"),
  "utf8",
);
assert.match(navSrc, /Ready/);
assert.match(navSrc, /Pickup/);
assert.match(navSrc, /Delivery/);
assert.match(navSrc, /Dine-In/);
assert.match(navSrc, /Completed/);
assert.match(navSrc, /History/);
assert.match(navSrc, /from \"next\/link\"/);
assert.match(navSrc, /<Link/);
assert.doesNotMatch(navSrc, /<a\s/);
assert.doesNotMatch(navSrc, /Ready for Pickup/);
assert.doesNotMatch(navSrc, /Picked Up \/ Delivered/);

const boardSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionLiveBoard.tsx"),
  "utf8",
);
assert.match(
  boardSrc,
  /Orders marked Ready appear here until their handoff is completed/,
);
assert.match(boardSrc, /No orders ready for pickup/);
assert.match(boardSrc, /No orders ready for delivery/);
assert.match(boardSrc, /No completed handoffs yet/);
assert.match(boardSrc, /No pickup or delivery history yet/);
assert.doesNotMatch(boardSrc, /Ready for Pickup/);

const queriesSrc = readFileSync(
  resolve("src/workspaces/collection/queries.ts"),
  "utf8",
);
assert.match(queriesSrc, /listCollectionReadyQueueOrders/);
assert.match(queriesSrc, /listCollectionPickupReadyOrders/);
assert.match(queriesSrc, /listCollectionDeliveryReadyOrders/);
assert.match(queriesSrc, /listCollectionCompletedOrders/);
assert.match(queriesSrc, /listCollectionHistoryOrders/);
assert.match(queriesSrc, /delivered_at/);
assert.doesNotMatch(
  queriesSrc,
  /out_for_delivery_at\.is\.null/,
  "Delivery queue must not filter out OFD via out_for_delivery_at",
);
assert.match(
  readFileSync(resolve("src/workspaces/collection/select.ts"), "utf8"),
  /out_for_delivery_at/,
);
assert.match(
  readFileSync(resolve("src/workspaces/collection/map-order.ts"), "utf8"),
  /outForDeliveryAt/,
);
assert.match(
  readFileSync(resolve("src/workspaces/collection/eligibility.ts"), "utf8"),
  /out_for_delivery/,
);
assert.match(boardSrc, /count === 1 \? "delivery" : "deliveries"/);
assert.doesNotMatch(
  boardSrc,
  /Pickup History/,
  "History board heading must be History, not Pickup History",
);
assert.match(boardSrc, /case "history":\s*return "History"/);

const historyBoardDate = "2026-10-23";
const historyPickupDate = "2026-10-10";
assert.notEqual(historyBoardDate, historyPickupDate);
assert.equal(
  collectionOrderHref("hist-1", historyBoardDate, "history"),
  "/collection/orders/hist-1?date=2026-10-23&tab=history",
);
assert.equal(
  collectionDateNavHref(historyBoardDate, "history"),
  "/collection?date=2026-10-23&tab=history",
);
assert.equal(
  collectionDateNavHref(historyBoardDate, "pickup"),
  "/collection?date=2026-10-23&tab=pickup",
);
assert.equal(
  collectionDateNavHref(historyBoardDate, "delivery"),
  "/collection?date=2026-10-23&tab=delivery",
);
assert.equal(
  collectionOrderHref("ready-1", historyPickupDate, "ready"),
  "/collection/orders/ready-1?date=2026-10-10",
);
assert.equal(
  collectionOrderHref("done-1", historyPickupDate, "completed"),
  "/collection/orders/done-1?date=2026-10-10&tab=completed",
);

const cardSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionOrderCard.tsx"),
  "utf8",
);
assert.match(
  cardSrc,
  /collectionOrderHref\(order\.id, boardDate, tab\)/,
);
assert.doesNotMatch(
  cardSrc,
  /collectionOrderHref\(order\.id, order\.pickupDate/,
);
assert.match(cardSrc, /order\.pickupDate !== boardDate/);

const detailSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionOrderDetail.tsx"),
  "utf8",
);
assert.match(detailSrc, /collectionDateNavHref\(boardDate, tab\)/);
assert.match(detailSrc, /← Board/);

const orderPageSrc = readFileSync(
  resolve("src/app/(app)/collection/orders/[id]/page.tsx"),
  "utf8",
);
assert.match(orderPageSrc, /resolveCollectionBoardDate\(query\.date\)/);
assert.match(orderPageSrc, /parseCollectionBoardTab\(query\.tab\)/);
assert.match(orderPageSrc, /boardDate=\{boardDate\}/);
assert.match(orderPageSrc, /tab=\{tab\}/);

console.log("PASS Collection tabs / history");
