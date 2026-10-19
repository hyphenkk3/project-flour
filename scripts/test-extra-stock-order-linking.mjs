import assert from "node:assert/strict";
import { mapAssignedOrderSummariesByStock } from "../src/workspaces/extra/assigned-order-links.ts";

const order = {
  id: "order-a",
  order_number: "ORD-SYNTHETIC-1",
  guest_name: "Synthetic DEV customer",
};
const legacyOrder = {
  id: "legacy-order",
  order_number: "ORD-SYNTHETIC-LEGACY",
  guest_name: "Legacy synthetic customer",
  extra_stock_id: "legacy-stock",
};

const assignments = mapAssignedOrderSummariesByStock(
  [
    { id: "stock-a", order_id: "order-a" },
    { id: "stock-b", order_id: "order-a" },
    { id: "legacy-stock", order_id: null },
    { id: "unassigned-stock", order_id: null },
    { id: "orphaned-stock", order_id: "missing-order" },
  ],
  [order, legacyOrder],
);

assert.equal(assignments.size, 3);
assert.equal(assignments.get("stock-a")?.id, order.id);
assert.equal(assignments.get("stock-b")?.id, order.id);
assert.equal(assignments.get("stock-a")?.readinessLinkVerified, true);
assert.equal(assignments.get("stock-b")?.readinessLinkVerified, true);
assert.equal(assignments.get("legacy-stock")?.id, legacyOrder.id);
assert.equal(assignments.get("legacy-stock")?.readinessLinkVerified, false);
assert.equal(assignments.has("unassigned-stock"), false);
assert.equal(assignments.has("orphaned-stock"), false);

console.log("Fresh Pick per-stock order linking tests passed.");
