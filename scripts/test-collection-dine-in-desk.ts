/**
 * Collection Dine-in desk — eligibility, labels, and wiring (no DB).
 * Run: npx tsx scripts/test-collection-dine-in-desk.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canAccessCollectionWorkspace,
  buildCollectionWorkspaceCapabilities,
} from "@/engines/collection/capabilities";
import {
  isActiveOnCollectionBoard,
  isActiveOnCollectionDineInBoard,
  isCollectionCompleteDineInEligible,
  isCollectionDineInMethod,
  isCollectionMarkCollectedEligible,
  isCollectionPickupMethod,
  isCollectionUndoCollectedEligible,
  isCollectionUndoDineInEligible,
  isCompletedCollectionHandoff,
  isCompletedOnCollectionBoard,
  isVisibleOnCollectionDetail,
  parseCollectionBoardTab,
  parseCollectionDineInVenueFilter,
  collectionDeskPresentation,
  collectionHandoffSurface,
  sortCollectionDineInBoardOrders,
} from "@/workspaces/collection/eligibility";

const day = "2026-08-20";
const dineInBase = {
  customerId: null as string | null,
  pickupDate: day,
  selectedPickupDate: day,
  status: "paid",
  fulfilmentMethod: "dine_in",
  readyAt: "2026-08-20T04:00:00Z",
  pickedUpAt: null as string | null,
  deliveredAt: null as string | null,
};

assert.equal(isCollectionDineInMethod("dine_in"), true);
assert.equal(isCollectionPickupMethod("dine_in"), false);
assert.equal(parseCollectionBoardTab("dine_in"), "dine_in");
assert.equal(parseCollectionDineInVenueFilter("hyphen"), "hyphen");
assert.equal(parseCollectionDineInVenueFilter("nope"), "all");

assert.equal(
  isActiveOnCollectionBoard(dineInBase),
  false,
  "Dine-in must not appear on Pickup Ready",
);
assert.equal(isActiveOnCollectionDineInBoard(dineInBase), true);
assert.equal(
  isActiveOnCollectionDineInBoard({ ...dineInBase, readyAt: null }),
  true,
  "Dine-in board shows reservations before Ready",
);
assert.equal(
  isActiveOnCollectionDineInBoard({
    ...dineInBase,
    pickedUpAt: "2026-08-20T08:00:00Z",
  }),
  false,
);

assert.equal(
  isActiveOnCollectionBoard({
    ...dineInBase,
    fulfilmentMethod: "pickup",
  }),
  true,
);
assert.equal(
  isActiveOnCollectionDineInBoard({
    ...dineInBase,
    fulfilmentMethod: "pickup",
  }),
  false,
);
assert.equal(
  isActiveOnCollectionDineInBoard({
    ...dineInBase,
    fulfilmentMethod: "delivery",
  }),
  false,
);

assert.equal(
  isCollectionMarkCollectedEligible({
    readyAt: dineInBase.readyAt,
    pickedUpAt: null,
    fulfilmentMethod: "dine_in",
    status: "paid",
  }),
  false,
  "Pickup collect helper stays pickup-only",
);
assert.equal(
  isCollectionCompleteDineInEligible({
    readyAt: dineInBase.readyAt,
    pickedUpAt: null,
    fulfilmentMethod: "dine_in",
    status: "paid",
  }),
  true,
);
assert.equal(
  isCollectionCompleteDineInEligible({
    readyAt: null,
    pickedUpAt: null,
    fulfilmentMethod: "dine_in",
    status: "paid",
  }),
  false,
  "Complete Dine-in still requires Ready",
);

const completed = {
  ...dineInBase,
  pickedUpAt: "2026-08-20T08:00:00Z",
};
assert.equal(isCompletedCollectionHandoff(completed), true);
assert.equal(isCompletedOnCollectionBoard(completed), true);
assert.equal(isCollectionUndoDineInEligible(completed), true);
assert.equal(
  isCollectionUndoCollectedEligible(completed),
  false,
  "Pickup undo helper stays pickup-only",
);

assert.equal(
  isVisibleOnCollectionDetail({
    ...dineInBase,
    readyAt: null,
  }),
  true,
);
assert.equal(isVisibleOnCollectionDetail(completed), true);

assert.equal(
  collectionDeskPresentation({
    readyAt: null,
    pickedUpAt: null,
    fulfilmentMethod: "dine_in",
  }),
  "dine_in_pending",
);
assert.equal(
  collectionDeskPresentation({
    readyAt: dineInBase.readyAt,
    pickedUpAt: null,
    fulfilmentMethod: "dine_in",
  }),
  "dine_in_ready",
);
assert.equal(
  collectionDeskPresentation({
    readyAt: dineInBase.readyAt,
    pickedUpAt: completed.pickedUpAt,
    fulfilmentMethod: "dine_in",
  }),
  "dine_in_complete",
);

const readySurface = collectionHandoffSurface({
  presentation: "dine_in_ready",
  canMarkCollected: true,
  canUndoCollected: true,
  markCollectedEligible: true,
  undoCollectedEligible: false,
});
assert.equal(readySurface.canMarkCollected, true);
assert.equal(readySurface.canUndoCollected, false);

const doneSurface = collectionHandoffSurface({
  presentation: "dine_in_complete",
  canMarkCollected: true,
  canUndoCollected: true,
  markCollectedEligible: false,
  undoCollectedEligible: true,
});
assert.equal(doneSurface.canMarkCollected, false);
assert.equal(doneSurface.canUndoCollected, true);

const sorted = sortCollectionDineInBoardOrders([
  {
    dineIn: { reservationTime: "15:00" },
    pickupTime: "15:00",
    orderNumber: "B",
  },
  {
    dineIn: { reservationTime: "14:00" },
    pickupTime: "15:00",
    orderNumber: "A",
  },
]);
assert.equal(sorted[0]?.orderNumber, "A");

for (const role of [
  "owner",
  "manager",
  "collection",
  "customer_operations",
] as const) {
  assert.equal(canAccessCollectionWorkspace(role), true, role);
  const caps = buildCollectionWorkspaceCapabilities({
    role,
    staffId: `${role}-1`,
  });
  assert.equal(caps.canMarkCollected, true, `${role} complete`);
  assert.equal(caps.canUndoCollected, true, `${role} undo`);
}
assert.equal(canAccessCollectionWorkspace("bakery"), false);

const extraSrc = readFileSync(
  resolve("src/workspaces/storefront/extra/GuestExtraOrderForm.tsx"),
  "utf8",
);
assert.doesNotMatch(extraSrc, /dine_in/);
assert.doesNotMatch(extraSrc, /Delivery/);

const navSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionWorkspaceNav.tsx"),
  "utf8",
);
assert.match(navSrc, /Dine-In/);
assert.match(navSrc, /Ready/);

const cardSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionOrderCard.tsx"),
  "utf8",
);
assert.match(cardSrc, /Reservation:/);
assert.match(cardSrc, /Cake serving:/);
assert.doesNotMatch(cardSrc, /\(jw\)|WB QR|c\/o|NYP/);

const detailSrc = readFileSync(
  resolve("src/workspaces/collection/CollectionOrderDetail.tsx"),
  "utf8",
);
assert.match(detailSrc, /Complete Dine-in/);
assert.match(detailSrc, /Reservation/);
assert.match(detailSrc, /Cake serving/);
assert.doesNotMatch(detailSrc, /\(jw\)|WB QR|c\/o|NYP/);

const actionsSrc = readFileSync(
  resolve("src/workspaces/collection/actions.ts"),
  "utf8",
);
assert.match(actionsSrc, /mark_guest_order_picked_up/);
assert.match(actionsSrc, /undo_guest_order_picked_up/);
assert.match(actionsSrc, /isCollectionCompleteDineInEligible/);

const queriesSrc = readFileSync(
  resolve("src/workspaces/collection/queries.ts"),
  "utf8",
);
assert.match(queriesSrc, /listCollectionDineInOrders/);
assert.match(queriesSrc, /fulfilment_method", "dine_in"/);

const checkoutSrc = readFileSync(
  resolve("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx"),
  "utf8",
);
assert.match(checkoutSrc, /Cake serving time/);
assert.match(checkoutSrc, /Dine-in reservation time/);

console.log("PASS Collection dine-in desk");
