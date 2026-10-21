const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("src/engines/extra/assignment-eligibility.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports, Map, Math, String });

const stock = { libraryCakeId: "cake-a", libraryCakeSizeId: "size-6", cakeName: "Cocoa", sizeLabel: "6 inch" };
const item = (cakeId, cakeSizeId, quantity = 1, cakeName = "Cocoa", sizeLabel = "6 inch") => ({
  cakeId, cakeSizeId, quantity, cakeName, sizeLabel,
});
const order = { status: "paid", pickedUpAt: null, outForDeliveryAt: null, deliveredAt: null };
const eligible = (orderItems, assignedStocks = [], candidateOrder = order) =>
  moduleExports.assessFreshPickAssignmentEligibility({ stock, orderItems, assignedStocks, order: candidateOrder });

assert.equal(eligible([item("cake-a", "size-6")]).canAssign, true);
assert.equal(eligible([item("cake-b", "size-6")]).reason, "This order does not contain the same cake and size.");
assert.equal(eligible([item("cake-a", "size-8")]).matchesStock, false);
assert.equal(eligible([item("cake-a", "size-6", 0)]).canAssign, false);
assert.equal(eligible([item(null, null, 1)], []).matchesStock, false, "catalogue IDs remain strict when stock IDs exist");
assert.equal(eligible([item(null, null, 1)], [], { ...order, status: "completed" }).canAssign, false);
assert.equal(eligible([item(null, null, 1)], [], { ...order, pickedUpAt: "2026-10-21T00:00:00Z" }).canAssign, false);
assert.equal(eligible([item(null, null, 1)], [], { ...order, outForDeliveryAt: "2026-10-21T00:00:00Z" }).canAssign, false);
assert.equal(eligible([item("cake-a", "size-6", 2)], [
  { id: "allocated-1", ...stock },
]).canAssign, true, "quantity two permits one further unit");
assert.equal(eligible([item("cake-a", "size-6", 2)], [
  { id: "allocated-1", ...stock }, { id: "allocated-2", ...stock }, { id: "allocated-2", ...stock },
]).canAssign, false, "each distinct physical unit counts once");
assert.equal(moduleExports.matchesAssignedFreshPickStock(stock, {
  id: "legacy", libraryCakeId: null, libraryCakeSizeId: null, cakeName: " cocoa ", sizeLabel: "6 INCH",
}), true, "legacy labels are used only when catalogue IDs are absent");
assert.equal(moduleExports.isFreshPickAssignmentOrderOpen({ ...order, status: "cancelled" }), false);

console.log("assignment_eligibility=PASS");
