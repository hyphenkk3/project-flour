/**
 * Live Collection — eligibility / surface helpers (no DB).
 * Run: npx tsx scripts/test-collection-eligibility.ts
 */
import assert from "node:assert/strict";
import {
  collectionDeskPresentation,
  collectionHandoffSurface,
  hasCollectionPaymentAttention,
  isActiveOnCollectionBoard,
  isActiveOnCollectionDeliveryBoard,
  isActiveOnCollectionDineInReadyBoard,
  isActiveOnCollectionReadyQueue,
  isCollectionMarkCollectedEligible,
  isCollectionUndoCollectedEligible,
  isVisibleOnCollectionDetail,
} from "@/workspaces/collection/eligibility";

const base = {
  customerId: null as string | null,
  pickupDate: "2026-10-23",
  selectedPickupDate: "2026-10-23",
  status: "paid",
  fulfilmentMethod: "pickup",
  readyAt: "2026-10-23T01:00:00Z",
  pickedUpAt: null as string | null,
};

assert.equal(isActiveOnCollectionBoard(base), true);
assert.equal(
  isActiveOnCollectionBoard({ ...base, fulfilmentMethod: "delivery" }),
  false,
  "Delivery excluded from Pickup board",
);
assert.equal(
  isActiveOnCollectionBoard({ ...base, readyAt: null }),
  false,
  "Ready required",
);
assert.equal(
  isActiveOnCollectionBoard({
    ...base,
    pickedUpAt: "2026-10-23T02:00:00Z",
  }),
  false,
  "Collected excluded from board",
);
assert.equal(
  isActiveOnCollectionBoard({ ...base, customerId: "member-1" }),
  false,
);
assert.equal(
  isActiveOnCollectionBoard({ ...base, status: "cancelled" as never }),
  false,
);

const deliveryReady = {
  ...base,
  fulfilmentMethod: "delivery" as const,
  deliveredAt: null as string | null,
};
assert.equal(isActiveOnCollectionDeliveryBoard(deliveryReady), true);
assert.equal(
  isActiveOnCollectionDeliveryBoard({
    ...deliveryReady,
    deliveredAt: "2026-10-23T05:00:00Z",
  }),
  false,
);
assert.equal(
  isActiveOnCollectionDeliveryBoard({ ...deliveryReady, readyAt: null }),
  false,
);
assert.equal(
  isActiveOnCollectionBoard(deliveryReady),
  false,
  "Delivery-ready must not appear on Pickup",
);
assert.equal(
  isActiveOnCollectionReadyQueue({
    ...deliveryReady,
    pickedUpAt: null,
  }),
  true,
  "Delivery-ready appears on Ready",
);
assert.equal(
  isActiveOnCollectionReadyQueue({
    ...base,
    deliveredAt: null,
  }),
  true,
  "Pickup-ready appears on Ready",
);
assert.equal(
  isActiveOnCollectionReadyQueue({
    ...base,
    fulfilmentMethod: "dine_in",
    deliveredAt: null,
  }),
  true,
  "Dine-in-ready appears on Ready",
);
assert.equal(
  isActiveOnCollectionDineInReadyBoard({
    ...base,
    fulfilmentMethod: "dine_in",
    readyAt: null,
  }),
  false,
  "Dine-in without Ready stays off Ready tab",
);
assert.equal(
  isActiveOnCollectionDeliveryBoard({
    ...base,
    fulfilmentMethod: "pickup",
    deliveredAt: null,
  }),
  false,
  "Pickup-ready must not appear on Delivery",
);

assert.equal(
  isVisibleOnCollectionDetail({
    ...base,
    pickedUpAt: "2026-10-23T02:00:00Z",
  }),
  true,
  "Collected detail for Undo",
);
assert.equal(
  isVisibleOnCollectionDetail({
    ...base,
    readyAt: null,
    pickedUpAt: "2026-10-23T02:00:00Z",
  }),
  true,
  "Completed Picked Up remains openable from Collection history",
);
assert.equal(
  isVisibleOnCollectionDetail({
    ...deliveryReady,
    deliveredAt: null,
  }),
  true,
  "Delivery-ready opens on Collection detail",
);
assert.equal(
  isVisibleOnCollectionDetail({
    ...deliveryReady,
    deliveredAt: "2026-10-23T05:00:00Z",
  }),
  true,
  "Delivered opens from Completed/History",
);

assert.equal(
  isCollectionMarkCollectedEligible({
    readyAt: base.readyAt,
    pickedUpAt: null,
    fulfilmentMethod: "pickup",
    status: "awaiting_payment",
  }),
  true,
  "AP Ready may Collect (payment independent)",
);
assert.equal(
  isCollectionMarkCollectedEligible({
    readyAt: null,
    pickedUpAt: null,
    fulfilmentMethod: "pickup",
    status: "paid",
  }),
  false,
);
assert.equal(
  isCollectionUndoCollectedEligible({
    pickedUpAt: "2026-10-23T02:00:00Z",
    fulfilmentMethod: "pickup",
  }),
  true,
);

assert.equal(
  collectionDeskPresentation({
    readyAt: base.readyAt,
    pickedUpAt: null,
  }),
  "ready",
);
assert.equal(
  collectionDeskPresentation({
    readyAt: base.readyAt,
    pickedUpAt: "x",
  }),
  "picked_up",
);

const readySurface = collectionHandoffSurface({
  presentation: "ready",
  canMarkCollected: true,
  canUndoCollected: true,
  markCollectedEligible: true,
  undoCollectedEligible: false,
});
assert.equal(readySurface.canMarkCollected, true);
assert.equal(readySurface.canUndoCollected, false);

const collectedSurface = collectionHandoffSurface({
  presentation: "collected",
  canMarkCollected: true,
  canUndoCollected: true,
  markCollectedEligible: false,
  undoCollectedEligible: true,
});
assert.equal(collectedSurface.canMarkCollected, false);
assert.equal(collectedSurface.canUndoCollected, true);

assert.equal(
  hasCollectionPaymentAttention({
    readyAt: base.readyAt,
    status: "awaiting_payment",
  }),
  true,
);
assert.equal(
  hasCollectionPaymentAttention({
    readyAt: base.readyAt,
    status: "paid",
  }),
  false,
);

console.log("PASS Collection eligibility / surface helpers");
