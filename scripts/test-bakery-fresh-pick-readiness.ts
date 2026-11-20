/** Focused Bakery display readiness tests for assigned Fresh Pick units. */
import assert from "node:assert/strict";
import { buildBakeryWorkspaceCapabilities } from "@/engines/bakery/capabilities";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import {
  bakeryProductionSurface,
  bakeryOrderProductionPresentation,
  isBakeryFreshPickReadinessEligible,
  matchesBakeryQueueFilter,
} from "@/workspaces/bakery/eligibility";
import { mapBakeryBoardOrder } from "@/workspaces/bakery/map-order";

const assignedStock = (id: string, readyForCollection: boolean) => ({
  id,
  orderId: "order-1",
  lifecycle: "confirmed",
  soldAt: "2026-10-22T03:42:00Z",
  cutIntoSlicesAt: null,
  readyForCollection,
  cakeId: "yam",
  cakeName: "Signature Yam",
  sizeId: "size-6",
  sizeLabel: '6"',
});

function order(input: {
  fulfilmentMethod?: "pickup" | "dine_in" | "delivery";
  productionStartedAt?: string | null;
  readyAt?: string | null;
  stockReady?: boolean[];
  totalOrdered?: number;
}) {
  const stocks = (input.stockReady ?? [true]).map((ready, index) =>
    assignedStock(`stock-${index + 1}`, ready),
  );
  const totalOrdered = input.totalOrdered ?? stocks.length;
  return mapBakeryBoardOrder(
    {
      id: "order-1",
      order_number: "ORD-TEST",
      guest_name: "Synthetic bakery test",
      customer_id: null,
      pickup_date: "2026-10-23",
      pickup_time: "13:00:00",
      fulfilment_method: input.fulfilmentMethod ?? "pickup",
      status: "paid",
      customer_notes: null,
      needs_bakery_attention: false,
      bakery_attention_note: null,
      production_started_at: input.productionStartedAt ?? null,
      production_started_by: null,
      ready_at: input.readyAt ?? null,
      picked_up_at: null,
      out_for_delivery_at: null,
      include_receipt: false,
      extra_stock_id: null,
      order_items: [
        {
          id: "item-1",
          cake_id: "yam",
          cake_size_id: "size-6",
          cake_name: "Signature Yam",
          size_label: '6"',
          quantity: totalOrdered,
        },
      ],
      order_complimentary_items: [],
      order_paid_addons: [],
    },
    stocks,
  );
}

assert.equal(
  bakeryOrderProductionPresentation(order({ stockReady: [true] })),
  "ready",
  "fully Fresh Pick-supplied WhatsApp-style order derives Ready without order timestamps",
);
assert.equal(
  bakeryProductionSurface({
    presentation: "ready",
    status: "paid",
    readyAt: null,
    fulfilmentMethod: "delivery",
    freshPickDeliveryReady: true,
    canStartProduction: true,
    canUndoStart: true,
    canMarkReady: true,
    canUndoReady: true,
  }).kind,
  "fresh_pick_delivery_ready",
  "fully verified ready Fresh Pick Delivery exposes explicit whole-order Ready action",
);
assert.equal(
  bakeryProductionSurface({
    presentation: "ready",
    status: "awaiting_payment",
    readyAt: null,
    fulfilmentMethod: "delivery",
    freshPickDeliveryReady: false,
    canStartProduction: true,
    canUndoStart: true,
    canMarkReady: true,
    canUndoReady: true,
  }).kind,
  "fresh_pick_fulfilled",
  "Delivery stock readiness alone does not create an order Ready action or Undo Ready control",
);
assert.equal(
  bakeryProductionSurface({
    presentation: "in_production",
    status: "paid",
    readyAt: null,
    fulfilmentMethod: "delivery",
    freshPickDeliveryReady: false,
    canStartProduction: true,
    canUndoStart: true,
    canMarkReady: true,
    canUndoReady: true,
  }).kind,
  "in_production",
  "standard Bakery completion action remains unchanged",
);
for (const fulfilmentMethod of ["pickup", "dine_in"] as const) {
  assert.notEqual(
    bakeryProductionSurface({
      presentation: "ready",
      status: "paid",
      readyAt: "persisted-ready",
      fulfilmentMethod,
      freshPickDeliveryReady: true,
      canStartProduction: true,
      canUndoStart: true,
      canMarkReady: true,
      canUndoReady: true,
    }).kind,
    "fresh_pick_delivery_ready",
    `${fulfilmentMethod} retains the existing Fresh Pick synchronizer workflow`,
  );
}
assert.equal(
  bakeryOrderProductionPresentation(order({ stockReady: [true, true] })),
  "ready",
  "multiple assigned physical items are Ready only when both are ready",
);
assert.equal(
  bakeryOrderProductionPresentation(order({ stockReady: [false] })),
  "not_started",
  "assigned but unready Fresh Pick does not appear Ready",
);
assert.equal(
  bakeryOrderProductionPresentation(order({ stockReady: [true, false] })),
  "not_started",
  "multiple physical items require each assigned unit to be ready",
);
assert.equal(
  bakeryOrderProductionPresentation(
    order({ stockReady: [true], totalOrdered: 2, productionStartedAt: "started" }),
  ),
  "in_production",
  "mixed order waits for remaining Bakery production",
);
assert.equal(
  bakeryOrderProductionPresentation(
    order({
      fulfilmentMethod: "dine_in",
      stockReady: [true],
      totalOrdered: 2,
      productionStartedAt: "started",
      readyAt: "bakery-ready",
    }),
  ),
  "ready",
  "mixed dine-in order is Ready after stock and Bakery quantities are ready",
);
assert.equal(
  bakeryOrderProductionPresentation(
    order({ stockReady: [false], readyAt: "stale-order-ready" }),
  ),
  "in_production",
  "an order-level Ready timestamp cannot hide unready assigned stock",
);
assert.equal(
  bakeryOrderProductionPresentation(
    order({ stockReady: [true], readyAt: "website-readiness-sync" }),
  ),
  "ready",
  "customer-website stock sync remains compatible",
);
assert.equal(
  bakeryOrderProductionPresentation(
    order({ fulfilmentMethod: "delivery", stockReady: [true] }),
  ),
  "not_started",
  "delivery readiness stays on its existing order lifecycle",
);

const target = assignedStock("exact-stock", false);
for (const fulfilmentMethod of ["pickup", "dine_in"] as const) {
  assert.equal(
    isBakeryFreshPickReadinessEligible({
      fulfilmentMethod,
      pickedUpAt: null,
      outForDeliveryAt: null,
      stock: target,
    }),
    true,
  );
}
assert.equal(
  isBakeryFreshPickReadinessEligible({
    fulfilmentMethod: "delivery",
    pickedUpAt: null,
    outForDeliveryAt: null,
    stock: target,
  }),
  false,
  "delivery excludes stock readiness controls",
);
assert.equal(
  isBakeryFreshPickReadinessEligible({
    fulfilmentMethod: "pickup",
    pickedUpAt: "2026-10-23T06:00:00Z",
    outForDeliveryAt: null,
    stock: target,
  }),
  false,
  "controls disappear after pickup handoff",
);
const readyBeforeUndo = order({ stockReady: [true] });
assert.equal(
  matchesBakeryQueueFilter(readyBeforeUndo, "ready"),
  true,
  "the Bakery board places derived Fresh Pick readiness in the Ready queue",
);
assert.equal(
  matchesBakeryQueueFilter(readyBeforeUndo, "not_ready"),
  false,
  "the same order is excluded from the not-ready queue",
);
const afterStockUndo = {
  ...readyBeforeUndo,
  assignedFreshPickStocks: readyBeforeUndo.assignedFreshPickStocks.map(
    (stock) => ({ ...stock, readyForCollection: false }),
  ),
};
assert.equal(
  bakeryOrderProductionPresentation(afterStockUndo),
  "not_started",
  "undoing readiness removes the derived Ready state",
);
assert.equal(
  bakeryOrderProductionPresentation({
    ...afterStockUndo,
    assignedFreshPickStocks: afterStockUndo.assignedFreshPickStocks.map(
      (stock) => ({ ...stock, readyForCollection: true }),
    ),
  }),
  "ready",
  "re-marking the same stock restores Ready on the next read",
);

for (const role of ["bakery", "manager", "owner"] as const) {
  const caps = buildExtraWorkspaceCapabilities({ role, staffId: `${role}-1` });
  assert.equal(caps.canMarkReadyForCollection, true, `${role} can mark stock ready`);
  assert.equal(caps.canUndoReadyForCollection, true, `${role} can undo stock ready`);
}
const unauthorized = buildExtraWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "co-1",
});
assert.equal(unauthorized.canMarkReadyForCollection, false);
assert.equal(unauthorized.canUndoReadyForCollection, false);
assert.equal(
  buildBakeryWorkspaceCapabilities({ role: "bakery", staffId: "b-1" })
    .canAccessBakeryWorkspace,
  true,
);

console.log("PASS Bakery Fresh Pick readiness presentation and role gates");
