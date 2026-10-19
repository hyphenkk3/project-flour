import assert from "node:assert/strict";
import { mapAssignedOrderSummariesByStock } from "../src/workspaces/extra/assigned-order-links.ts";

const order = {
  id: "order-a",
  order_number: "ORD-SYNTHETIC-1",
  guest_name: "Synthetic DEV customer",
};

const assignments = mapAssignedOrderSummariesByStock(
  [
    { id: "stock-a", order_id: "order-a" },
    { id: "stock-b", order_id: "order-a" },
    { id: "unassigned-stock", order_id: null },
    { id: "orphaned-stock", order_id: "missing-order" },
  ],
  [order],
);

assert.equal(assignments.size, 2);
assert.equal(assignments.get("stock-a"), order);
assert.equal(assignments.get("stock-b"), order);
assert.equal(assignments.has("unassigned-stock"), false);
assert.equal(assignments.has("orphaned-stock"), false);

console.log("Fresh Pick per-stock order linking tests passed.");
