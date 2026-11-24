import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildHomeCockpitModel } from "../src/workspaces/home/cockpit-model";
import type { StorefrontOrderListItem } from "../src/types/storefront";
import {
  collectionDeskLabel,
  collectionDeskPresentation,
} from "../src/workspaces/collection/eligibility";

const date = "2026-08-15";
const readyAt = "2026-08-15T01:00:00.000Z";
const handoffAt = "2026-08-15T02:00:00.000Z";

function order(
  id: string,
  fulfilmentMethod: StorefrontOrderListItem["fulfilmentMethod"],
  overrides: Partial<StorefrontOrderListItem> = {},
): StorefrontOrderListItem {
  return {
    id,
    orderNumber: `WB-${id}`,
    customerName: "Synthetic Guest",
    phone: "",
    cakeName: "Synthetic Cake",
    sizeLabel: "6\"",
    additionalItemCount: 0,
    pickupDate: date,
    pickupTime: "15:00:00",
    status: "paid",
    createdAt: `${date}T00:00:00.000Z`,
    confirmationNeedsResend: false,
    orderSource: "walk_in",
    crewOrder: false,
    extraStockId: null,
    fulfilmentMethod,
    delivery: null,
    dineInReservation: null,
    notes: null,
    internalNotes: null,
    needsBakeryAttention: false,
    bakeryAttentionNote: null,
    productionStartedAt: null,
    readyAt,
    readyBy: null,
    pickedUpAt: null,
    pickedUpBy: null,
    outForDeliveryAt: null,
    outForDeliveryBy: null,
    deliveredAt: null,
    deliveredBy: null,
    paymentDeadlineAt: null,
    paymentRequestSentAt: null,
    rm10CardIssuanceSuppressed: false,
    rm10CardIssuanceSuppressionCode: null,
    items: [],
    paidAddons: [],
    complimentaryItems: [],
    total: 0,
    adjustments: [],
    paymentAllocations: [],
    refunds: [],
    settlement: {} as StorefrontOrderListItem["settlement"],
    postPaymentCustomerChangeCount: 0,
    postPaymentCustomerChangeUsedAt: null,
    postPaymentChangeOverrideAt: null,
    postPaymentChangeOverrideBy: null,
    hasPendingFeeRequest: false,
    ...overrides,
  } as StorefrontOrderListItem;
}

const fulfilments = ["pickup", "delivery", "dine_in"] as const;
const fixtures: StorefrontOrderListItem[] = [];
for (const fulfilment of fulfilments) {
  fixtures.push(order(`${fulfilment}-ready`, fulfilment));
  for (const [index, status] of [
    "submitted",
    "pending_confirmation",
    "awaiting_payment",
    "paid",
  ].entries()) {
    fixtures.push(
      order(`${fulfilment}-not-ready-${index}`, fulfilment, {
        status,
        readyAt: null,
      }),
    );
  }
  fixtures.push(
    order(`${fulfilment}-completed`, fulfilment, {
      pickedUpAt: fulfilment === "delivery" ? null : handoffAt,
      deliveredAt: fulfilment === "delivery" ? handoffAt : null,
    }),
  );
  fixtures.push(
    order(`${fulfilment}-cancelled`, fulfilment, { status: "cancelled" }),
  );
}

// Duplicate source rows must not inflate an order count.
fixtures.push(fixtures[0]);
fixtures.push(order("future-ready", "pickup", { pickupDate: "2026-08-16" }));

const model = buildHomeCockpitModel({
  orders: fixtures,
  readyCollection: [],
  completedCollection: [],
  dineInCollection: [],
  bakeryOrders: [],
  pendingApprovals: [],
  navigation: [],
  now: new Date("2026-08-15T04:00:00.000Z"),
});

assert.equal(
  model.summary.ready,
  3,
  "count one active Ready order for each fulfilment, excluding duplicate, not-ready, completed, cancelled, and out-of-date fixtures",
);

const pickup = collectionDeskPresentation({
  readyAt,
  pickedUpAt: null,
  fulfilmentMethod: "pickup",
});
const delivery = collectionDeskPresentation({
  readyAt,
  pickedUpAt: null,
  deliveredAt: null,
  fulfilmentMethod: "delivery",
});
const dineIn = collectionDeskPresentation({
  readyAt,
  pickedUpAt: null,
  fulfilmentMethod: "dine_in",
});
assert.equal(collectionDeskLabel(pickup), "Ready for Collection");
assert.equal(collectionDeskLabel(delivery), "Ready for Delivery");
assert.equal(collectionDeskLabel(dineIn), "Ready for Dine-In");

const collectionNav = readFileSync(
  resolve("src/workspaces/collection/CollectionWorkspaceNav.tsx"),
  "utf8",
);
const collectionBoard = readFileSync(
  resolve("src/workspaces/collection/CollectionLiveBoard.tsx"),
  "utf8",
);
assert.match(collectionNav, /id: "ready", label: "Ready Orders"/);
assert.match(collectionBoard, /default:\s*return "Ready Orders"/);

console.log("Home Ready count and fulfilment labels passed.");
