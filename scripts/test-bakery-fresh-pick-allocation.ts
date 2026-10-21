/** Focused pure tests for Bakery's Fresh Pick allocation read model. */
import assert from "node:assert/strict";
import {
  bakeryFreshPickStartBlock,
  summarizeBakeryFreshPickAllocations,
  type BakeryAssignedStockInput,
  type BakeryCakeRequirementInput,
} from "../src/engines/bakery/fresh-pick-allocation.ts";

const ORDER = "order-1";
const cakeA: BakeryCakeRequirementInput = {
  cakeId: "cake-a",
  cakeName: "Chocolate",
  sizeId: "size-6",
  sizeLabel: '6"',
  quantity: 3,
};
const stock = (overrides: Partial<BakeryAssignedStockInput> = {}): BakeryAssignedStockInput => ({
  id: "stock-1",
  orderId: ORDER,
  lifecycle: "confirmed",
  soldAt: "2026-10-21T01:00:00Z",
  cutIntoSlicesAt: null,
  cakeId: "cake-a",
  cakeName: "Chocolate",
  sizeId: "size-6",
  sizeLabel: '6"',
  ...overrides,
});
const summarize = (
  cakeRequirements: BakeryCakeRequirementInput[],
  stockRows: BakeryAssignedStockInput[] = [],
  primaryStockId: string | null = null,
) =>
  summarizeBakeryFreshPickAllocations({
    orderId: ORDER,
    primaryStockId,
    cakeRequirements,
    stockRows,
    now: new Date("2026-10-21T02:00:00Z"),
  });

// 1. No physical allocation leaves the full ordered quantity for Bakery.
let summary = summarize([cakeA]);
assert.equal(summary.status, "verified");
assert.equal(summary.lines[0]?.orderedQuantity, 3);
assert.equal(summary.lines[0]?.assignedQuantity, 0);
assert.equal(summary.lines[0]?.remainingQuantity, 3);

// 2. Full allocation covers the cake, without altering the source order line.
const originalQuantity = cakeA.quantity;
summary = summarize([cakeA], [stock(), stock({ id: "stock-2" }), stock({ id: "stock-3" })]);
assert.equal(summary.fullyCovered, true);
assert.equal(summary.totalRemainingQuantity, 0);
assert.equal(cakeA.quantity, originalQuantity);

// 3. Partial allocation gives an exact remaining-to-produce count.
summary = summarize([cakeA], [stock(), stock({ id: "stock-2" })]);
assert.equal(summary.lines[0]?.assignedQuantity, 2);
assert.equal(summary.lines[0]?.remainingQuantity, 1);

// 4. Flavours are not combined even at the same size.
const cakeB = { ...cakeA, cakeId: "cake-b", cakeName: "Matcha", quantity: 1 };
summary = summarize([cakeA, cakeB], [stock({ id: "stock-b", cakeId: "cake-b", cakeName: "Matcha" })]);
assert.equal(summary.lines.length, 2);
assert.equal(summary.lines.find((line) => line.cakeId === "cake-a")?.assignedQuantity, 0);
assert.equal(summary.lines.find((line) => line.cakeId === "cake-b")?.assignedQuantity, 1);

// 5. Different sizes remain separate for the same flavour.
const cakeA8 = { ...cakeA, sizeId: "size-8", sizeLabel: '8"', quantity: 1 };
summary = summarize([cakeA, cakeA8], [stock({ id: "stock-8", sizeId: "size-8", sizeLabel: '8"' })]);
assert.equal(summary.lines.length, 2);
assert.equal(summary.lines.find((line) => line.sizeId === "size-6")?.assignedQuantity, 0);
assert.equal(summary.lines.find((line) => line.sizeId === "size-8")?.assignedQuantity, 1);

// 6–7. Duplicate identical cake lines aggregate; one allocation maps to the group.
summary = summarize([{ ...cakeA, quantity: 2 }, { ...cakeA, quantity: 1 }], [stock()]);
assert.equal(summary.lines.length, 1);
assert.equal(summary.lines[0]?.orderedQuantity, 3);
assert.equal(summary.lines[0]?.assignedQuantity, 1);

// 8. Reciprocal order_id and legacy primary pointer overlap counts once.
summary = summarize([cakeA], [stock()], "stock-1");
assert.equal(summary.lines[0]?.assignedQuantity, 1);

// 9. A conflicting legacy pointer is not silently counted as valid.
summary = summarize([cakeA], [stock({ orderId: "another-order" })], "stock-1");
assert.equal(summary.status, "needs_review");
assert.equal(bakeryFreshPickStartBlock(summary), "review");
summary = summarize([cakeA], [stock({ legacyLinkConflict: true })]);
assert.equal(summary.status, "needs_review");

// 10. Rejected, cut, or unsold stock is not fulfilment and raises a review issue.
for (const invalid of [
  stock({ lifecycle: "rejected" }),
  stock({ cutIntoSlicesAt: "2026-10-21T01:30:00Z" }),
  stock({ soldAt: null }),
  stock({ walkInHeldUntil: "not-a-date" }),
]) {
  summary = summarize([cakeA], [invalid]);
  assert.equal(summary.status, "needs_review");
  assert.equal(summary.totalAssignedQuantity, 0);
  assert.equal(bakeryFreshPickStartBlock(summary), "review");
}

// 11. A stale stock pointer with no matching line blocks production visibly.
summary = summarize([cakeA], [stock({ cakeId: "other-cake", cakeName: "Other" })], "stock-1");
assert.equal(summary.status, "needs_review");
assert.equal(summary.fullyCovered, false);
summary = summarize([cakeA], [], "missing-stock-row");
assert.equal(summary.status, "needs_review");
assert.equal(summarize([]).status, "needs_review");

// 12. Undo/removal immediately restores the Bakery quantity on the next read.
const withAllocation = summarize([cakeA], [stock()]);
const afterUndo = summarize([cakeA], []);
assert.equal(withAllocation.lines[0]?.remainingQuantity, 2);
assert.equal(afterUndo.lines[0]?.remainingQuantity, 3);

// 13. Fully covered order starts are blocked; mixed orders keep real work actionable.
summary = summarize([{ ...cakeA, quantity: 1 }], [stock()]);
assert.equal(bakeryFreshPickStartBlock(summary), "fully_covered");
summary = summarize([{ ...cakeA, quantity: 2 }, cakeB], [stock()]);
assert.equal(summary.totalRemainingQuantity, 2);
assert.equal(bakeryFreshPickStartBlock(summary), null);

// 14. Ambiguous legacy name-only stock cannot be assigned to two catalogue groups.
summary = summarize(
  [cakeA, { ...cakeA, cakeId: "cake-a-duplicate", sizeId: "size-6-duplicate" }],
  [stock({ cakeId: null, sizeId: null })],
);
assert.equal(summary.status, "needs_review");

// 15. A duplicate API row for the same physical id remains one physical cake.
summary = summarize([cakeA], [stock(), stock()]);
assert.equal(summary.lines[0]?.assignedQuantity, 1);

console.log("PASS: Bakery Fresh Pick allocation summaries and production guard");
