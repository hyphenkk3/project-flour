/**
 * M5-P1 — pure eligibility, packing, date, read-model mapping helpers.
 * Run: npx tsx scripts/test-m5-p1-bakery-board-eligibility.ts
 */
import assert from "node:assert/strict";
import {
  bakeryCustomerNotesExcerpt,
  bakeryFulfilmentCue,
  bakeryPrimaryCakeSummary,
  bakeryProductionLabel,
  bakeryProductionPresentation,
  bakeryProductionSurface,
  bakeryStartSurface,
  deriveBakeryPackingReminders,
  hasPaymentAttention,
  isActiveOnBakeryBoard,
  isBakeryMarkReadyEligible,
  isBakeryOrderSecured,
  isBakeryStartEligibleStatus,
} from "@/workspaces/bakery/eligibility";
import {
  bakeryPlusTwoYmd,
  bakeryTodayYmd,
  bakeryTomorrowYmd,
  resolveBakeryBoardDate,
} from "@/workspaces/bakery/date";
import { mapBakeryBoardOrder } from "@/workspaces/bakery/map-order";

const DATE = "2026-09-15";

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "paid",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    fulfilmentMethod: "pickup",
  }),
  true,
  "paid guest included",
);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "submitted",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    fulfilmentMethod: "delivery",
  }),
  true,
  "Submitted guest included (planning visibility)",
);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "pending_confirmation",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    fulfilmentMethod: "pickup",
  }),
  true,
  "Waiting Customer Confirmation included",
);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "awaiting_payment",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    fulfilmentMethod: "pickup",
  }),
  true,
  "unpaid + not Ready still visible (not secured)",
);

assert.equal(
  isBakeryOrderSecured("awaiting_payment"),
  false,
);
assert.equal(isBakeryOrderSecured("paid"), true);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "awaiting_payment",
    readyAt: "2026-09-15T08:00:00Z",
    pickedUpAt: null,
    outForDeliveryAt: null,
    fulfilmentMethod: "pickup",
  }),
  true,
  "Ready + awaiting_payment retained",
);

assert.equal(
  hasPaymentAttention({
    readyAt: "2026-09-15T08:00:00Z",
    status: "awaiting_payment",
  }),
  true,
);

assert.equal(
  hasPaymentAttention({ readyAt: "2026-09-15T08:00:00Z", status: "paid" }),
  false,
);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "paid",
    readyAt: "2026-09-15T08:00:00Z",
    pickedUpAt: "2026-09-15T10:00:00Z",
    outForDeliveryAt: null,
    fulfilmentMethod: "pickup",
  }),
  false,
  "Pickup Picked Up excluded",
);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "paid",
    readyAt: "2026-09-15T08:00:00Z",
    pickedUpAt: null,
    outForDeliveryAt: null,
    fulfilmentMethod: "delivery",
  }),
  true,
  "Delivery Ready included",
);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "paid",
    readyAt: "2026-09-15T08:00:00Z",
    pickedUpAt: null,
    outForDeliveryAt: "2026-09-15T11:00:00Z",
    fulfilmentMethod: "delivery",
  }),
  false,
  "Delivery Out for Delivery excluded",
);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: null,
    pickupDate: DATE,
    selectedPickupDate: "2026-09-16",
    status: "paid",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    fulfilmentMethod: "pickup",
  }),
  false,
  "wrong date excluded",
);

assert.equal(
  isActiveOnBakeryBoard({
    customerId: "member-1",
    pickupDate: DATE,
    selectedPickupDate: DATE,
    status: "paid",
    readyAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    fulfilmentMethod: "pickup",
  }),
  false,
  "member/customer_id excluded",
);

assert.equal(bakeryProductionPresentation({ readyAt: null }), "not_started");
assert.equal(
  bakeryProductionPresentation({
    productionStartedAt: "2026-09-15T07:00:00Z",
    readyAt: null,
  }),
  "in_production",
);
assert.equal(
  bakeryProductionPresentation({ readyAt: "2026-09-15T08:00:00Z" }),
  "ready",
);
assert.equal(
  bakeryProductionPresentation({
    productionStartedAt: "2026-09-15T07:00:00Z",
    readyAt: "2026-09-15T08:00:00Z",
  }),
  "ready",
  "Ready wins over Start",
);
assert.equal(bakeryProductionLabel("not_started"), "Not started");
assert.equal(bakeryProductionLabel("in_production"), "In Production");
assert.equal(bakeryProductionLabel("ready"), "Ready");
assert.equal(
  hasPaymentAttention({
    productionStartedAt: "2026-09-15T07:00:00Z",
    readyAt: null,
    status: "awaiting_payment",
  }),
  true,
  "Started + unpaid is Payment Attention",
);

assert.equal(isBakeryStartEligibleStatus("submitted"), false);
assert.equal(isBakeryStartEligibleStatus("pending_confirmation"), false);
assert.equal(isBakeryStartEligibleStatus("awaiting_payment"), true);
assert.equal(isBakeryStartEligibleStatus("paid"), true);

assert.equal(
  bakeryStartSurface({
    presentation: "not_started",
    status: "submitted",
    canStartProduction: true,
    canUndoStart: true,
  }).kind,
  "waiting_confirmation",
);
assert.equal(
  bakeryStartSurface({
    presentation: "not_started",
    status: "awaiting_payment",
    canStartProduction: true,
    canUndoStart: true,
  }).kind,
  "start_unsecured",
);
assert.equal(
  bakeryStartSurface({
    presentation: "not_started",
    status: "paid",
    canStartProduction: true,
    canUndoStart: true,
  }).kind,
  "start_paid",
);
assert.equal(
  bakeryStartSurface({
    presentation: "in_production",
    status: "paid",
    canStartProduction: true,
    canUndoStart: true,
    canMarkReady: true,
    canUndoReady: true,
  }).kind,
  "in_production",
);
assert.equal(
  bakeryStartSurface({
    presentation: "ready",
    status: "paid",
    canStartProduction: true,
    canUndoStart: true,
    canMarkReady: true,
    canUndoReady: true,
  }).kind,
  "undo_ready",
);
assert.equal(
  bakeryStartSurface({
    presentation: "ready",
    status: "paid",
    canStartProduction: true,
    canUndoStart: true,
    canMarkReady: true,
    canUndoReady: false,
  }).kind,
  "none",
);

assert.equal(bakeryFulfilmentCue("delivery"), "Delivery");
assert.equal(bakeryFulfilmentCue("pickup"), "Pickup");

const summary = bakeryPrimaryCakeSummary({
  cakeLines: [
    { id: "1", cakeName: "Chocolate", sizeLabel: '6"', quantity: 1 },
    { id: "2", cakeName: "Matcha", sizeLabel: '8"', quantity: 2 },
  ],
});
assert.equal(summary.cakeName, "Chocolate");
assert.equal(summary.additionalCakeCount, 1);

assert.equal(
  bakeryCustomerNotesExcerpt("Less sweet please"),
  "Less sweet please",
);
assert.ok(
  (bakeryCustomerNotesExcerpt("x".repeat(100)) ?? "").endsWith("…"),
);

const packing = deriveBakeryPackingReminders({
  complimentaryItems: [{ id: "c1", name: "Knife", quantity: 1 }],
  paidAddons: [
    {
      id: "a1",
      name: "Birthday Card",
      quantity: 1,
      messages: [{ cardIndex: 1, writtenMessage: "Happy Birthday" }],
    },
  ],
  includeReceipt: true,
});
assert.ok(packing.some((p) => p.label === "Knife"));
assert.ok(packing.some((p) => p.label === "Birthday Card"));
assert.ok(packing.some((p) => p.label.includes("Happy Birthday")));
assert.ok(packing.some((p) => p.label === "Include RECEIPT"));

const mapped = mapBakeryBoardOrder({
  id: "o1",
  order_number: "ORD-TEST",
  guest_name: "Amy",
  customer_id: null,
  pickup_date: DATE,
  pickup_time: "16:00:00",
  fulfilment_method: "pickup",
  status: "paid",
  customer_notes: "Less sweet",
  needs_bakery_attention: true,
  bakery_attention_note: "Stage topper last",
  production_started_at: null,
  production_started_by: null,
  ready_at: null,
  picked_up_at: null,
  out_for_delivery_at: null,
  include_receipt: true,
  order_items: [
    {
      id: "i1",
      cake_name: "Chocolate",
      size_label: '6"',
      quantity: 1,
    },
    {
      id: "i2",
      cake_name: "Matcha",
      size_label: '8"',
      quantity: 1,
    },
  ],
  order_complimentary_items: [
    { id: "c1", name: "Candle", quantity: 2, sort_order: 1 },
  ],
  order_paid_addons: [],
});

assert.equal(mapped.cakeLines.length, 2);
assert.equal(mapped.customerNotes, "Less sweet");
assert.equal(mapped.needsBakeryAttention, true);
assert.equal(
  Object.prototype.hasOwnProperty.call(mapped, "internalNotes"),
  false,
);
assert.equal(
  Object.prototype.hasOwnProperty.call(mapped, "phone"),
  false,
);

const today = bakeryTodayYmd(new Date("2026-08-12T04:00:00Z"));
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(
  resolveBakeryBoardDate(null, new Date("2026-08-12T04:00:00Z")),
  today,
);
assert.equal(resolveBakeryBoardDate("2026-09-20"), "2026-09-20");
assert.equal(
  resolveBakeryBoardDate("not-a-date", new Date("2026-08-12T04:00:00Z")),
  today,
);
assert.equal(
  bakeryTomorrowYmd(new Date("2026-08-12T04:00:00Z")),
  bakeryPlusTwoYmd(new Date("2026-08-11T04:00:00Z")),
);

assert.equal(
  isBakeryMarkReadyEligible({
    productionStartedAt: "t",
    readyAt: null,
    status: "paid",
  }),
  true,
  "In Production Paid may Mark Ready",
);
assert.equal(
  isBakeryMarkReadyEligible({
    productionStartedAt: "t",
    readyAt: null,
    status: "awaiting_payment",
  }),
  true,
  "In Production AP may Mark Ready",
);
assert.equal(
  isBakeryMarkReadyEligible({
    productionStartedAt: null,
    readyAt: null,
    status: "paid",
  }),
  false,
  "Not started cannot Mark Ready on Bakery",
);
assert.equal(
  isBakeryMarkReadyEligible({
    productionStartedAt: "t",
    readyAt: null,
    status: "submitted",
  }),
  false,
  "Submitted cannot Mark Ready",
);
assert.equal(
  isBakeryMarkReadyEligible({
    productionStartedAt: "t",
    readyAt: "r",
    status: "paid",
  }),
  false,
  "Already Ready cannot Mark Ready",
);
assert.equal(
  isBakeryMarkReadyEligible({
    productionStartedAt: "t",
    readyAt: null,
    status: "paid",
    pickedUpAt: "p",
  }),
  false,
  "Terminal cannot Mark Ready",
);

const readySurface = bakeryProductionSurface({
  presentation: "ready",
  status: "awaiting_payment",
  canStartProduction: true,
  canUndoStart: true,
  canMarkReady: true,
  canUndoReady: true,
});
assert.equal(readySurface.kind, "undo_ready");

const inProd = bakeryProductionSurface({
  presentation: "in_production",
  status: "awaiting_payment",
  canStartProduction: true,
  canUndoStart: true,
  canMarkReady: true,
  canUndoReady: true,
});
assert.equal(inProd.kind, "in_production");
if (inProd.kind === "in_production") {
  assert.equal(inProd.canMarkReady, true);
  assert.equal(inProd.canUndoStart, true);
}

console.log("PASS M5-P1 bakery board eligibility / read-model helpers");
