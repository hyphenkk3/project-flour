/** Regression contract for Fresh Pick physical readiness before/after assignment. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deriveOperationalState,
  operationalStateLabel,
  withOperationalMarker,
} from "@/engines/orders/operational-state";
import {
  isBakeryOrderReadyForCollection,
  bakeryOrderProductionPresentation,
} from "@/workspaces/bakery/eligibility";
import { mapBakeryBoardOrder } from "@/workspaces/bakery/map-order";
import {
  collectionCustomerMessageAvailability,
} from "@/workspaces/collection/ready-message";
import {
  isActiveOnCollectionBoard,
  isCollectionMarkCollectedEligible,
  isCollectionPaymentEligibleForHandoff,
} from "@/workspaces/collection/eligibility";

const STOCK_ID = "synthetic-stock";
const ORDER_ID = "synthetic-order";
const stockRow = (readyForCollection: boolean) => ({
  id: STOCK_ID,
  orderId: ORDER_ID,
  lifecycle: "confirmed",
  soldAt: "synthetic-assignment-time",
  cutIntoSlicesAt: null,
  readyForCollection,
  cakeId: "cake-1",
  cakeName: "Synthetic cake",
  sizeId: "size-1",
  sizeLabel: '6"',
});

function mappedOrder(readyForCollection: boolean, productionStartedAt: string | null = null) {
  return mapBakeryBoardOrder(
    {
      id: ORDER_ID,
      order_number: "ORD-SYNTHETIC",
      guest_name: "Synthetic guest",
      customer_id: null,
      pickup_date: "2026-12-01",
      pickup_time: "14:00:00",
      fulfilment_method: "pickup",
      status: "submitted",
      customer_notes: null,
      needs_bakery_attention: false,
      bakery_attention_note: null,
      production_started_at: productionStartedAt,
      production_started_by: null,
      ready_at: null,
      picked_up_at: null,
      out_for_delivery_at: null,
      delivered_at: null,
      include_receipt: false,
      extra_stock_id: null,
      order_items: [{
        id: "synthetic-line",
        cake_id: "cake-1",
        cake_size_id: "size-1",
        cake_name: "Synthetic cake",
        size_label: '6"',
        quantity: 1,
      }],
      order_complimentary_items: [],
      order_paid_addons: [],
    },
    [stockRow(readyForCollection)],
  );
}

function assertReadinessCase(readyBeforeAssignment: boolean) {
  // The assignment RPC test separately proves it preserves this persisted bit.
  // This projection test proves each persisted result drives the right UI state.
  const order = mappedOrder(readyBeforeAssignment);
  const presentation = bakeryOrderProductionPresentation(order);
  assert.equal(
    presentation,
    readyBeforeAssignment ? "ready" : "not_started",
    readyBeforeAssignment
      ? "stock Ready before assignment remains Ready after assignment"
      : "stock not Ready before assignment remains Bakery Not Started",
  );

  for (const { status, paymentStatus } of [
    { status: "submitted", paymentStatus: "unpaid" },
    { status: "awaiting_payment", paymentStatus: "unpaid" },
    { status: "paid", paymentStatus: "paid" },
  ]) {
    const ready = isBakeryOrderReadyForCollection({
      order,
      readyAt: null,
      status,
      paymentStatus,
    });
    assert.equal(ready, readyBeforeAssignment);
    assert.equal(
      withOperationalMarker("Synthetic guest", {
        readyAt: null,
        derivedReadyForCollection: ready,
        pickedUpAt: null,
        fulfilmentMethod: "pickup",
      }),
      readyBeforeAssignment ? "● Synthetic guest" : "Synthetic guest",
      "Calendar marker follows physical readiness, independently of payment",
    );

    const collectionReady = isActiveOnCollectionBoard({
      customerId: null,
      pickupDate: "2026-12-01",
      selectedPickupDate: "2026-12-01",
      status,
      fulfilmentMethod: "pickup",
      readyAt: null,
      readyForCollection: ready,
      pickedUpAt: null,
    });
    assert.equal(collectionReady, readyBeforeAssignment);
    const operationalState = deriveOperationalState({
      readyAt: null,
      derivedReadyForCollection: ready,
      pickedUpAt: null,
      fulfilmentMethod: "pickup",
    });
    assert.equal(
      operationalStateLabel(operationalState, "pickup"),
      readyBeforeAssignment ? "Ready for Collection" : "Not Ready",
    );

    const message = collectionCustomerMessageAvailability({
      readyAt: null,
      derivedReadyForCollection: ready,
      pickedUpAt: null,
      deliveredAt: null,
      readyMessageSent: false,
    });
    assert.equal(message.showCustomer, readyBeforeAssignment);
    assert.equal(message.canOpenWhatsApp, readyBeforeAssignment);
    assert.equal(message.whatsappMessageKind, "ready");

    const handoffAllowed =
      isCollectionPaymentEligibleForHandoff({ status, paymentStatus }) &&
      isCollectionMarkCollectedEligible({
        readyAt: null,
        readyForCollection: ready,
        pickedUpAt: null,
        fulfilmentMethod: "pickup",
        status,
      });
    assert.equal(
      handoffAllowed,
      readyBeforeAssignment && status === "paid",
      "physical Ready does not bypass the existing unpaid-handoff gate",
    );
  }
}

assertReadinessCase(true);
assertReadinessCase(false);

// Bakery's supported physical Ready action can transition a previously
// unready assigned item. The order-level production history remains intact.
const afterBakeryReady = mappedOrder(true, "synthetic-production-start");
assert.equal(bakeryOrderProductionPresentation(afterBakeryReady), "ready");
assert.equal(afterBakeryReady.productionStartedAt, "synthetic-production-start");

// Undo Ready changes only physical readiness. Existing production progress is
// still represented; it must not be overwritten by a forced order status.
const afterUndoReady = mappedOrder(false, "synthetic-production-start");
assert.equal(
  bakeryOrderProductionPresentation(afterUndoReady),
  "in_production",
);
assert.equal(afterUndoReady.productionStartedAt, "synthetic-production-start");
assert.equal(
  withOperationalMarker("Synthetic guest", {
    readyAt: null,
    derivedReadyForCollection: false,
    pickedUpAt: null,
    fulfilmentMethod: "pickup",
  }),
  "Synthetic guest",
);
assert.equal(
  collectionCustomerMessageAvailability({
    readyAt: null,
    derivedReadyForCollection: false,
    pickedUpAt: null,
    deliveredAt: null,
    readyMessageSent: false,
  }).showCustomer,
  false,
);

const handoffGuard = readFileSync(
  "supabase/migrations/20261019122055_fresh_pick_readiness_requires_full_settlement.sql",
  "utf8",
).match(
  /create or replace function public\._guard_fresh_pick_order_readiness_and_handoff\(\)[\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(handoffGuard, "database Fresh Pick payment/handoff guard remains present");
assert.match(handoffGuard, /new\.status is distinct from 'paid'/);
assert.match(handoffGuard, /new\.payment_status is distinct from 'paid'/);
assert.match(handoffGuard, /order_net_received\(new\.id\) < public\.order_amount_due\(new\.id\)/);
assert.match(handoffGuard, /not v_fully_paid[\s\S]*?not v_stock_ready[\s\S]*?new\.ready_at is null/);
assert.match(handoffGuard, /Fresh Pick handoff requires full payment and ready linked stock/);

console.log("PASS Fresh Pick assignment readiness contract: pre-ready, not-ready, Bakery Ready/Undo, Calendar, Collection, message and payment gates");
