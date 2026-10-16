import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const cache = new Map();
function pure(name) {
  if (!name.startsWith("@/")) return require(name);
  if (cache.has(name)) return cache.get(name);
  const stem = path.join(process.cwd(), "src", name.slice(2));
  const file = [stem + ".ts", stem + ".tsx", path.join(stem, "index.ts")].find(existsSync);
  assert.ok(file, `missing module ${name}`);
  const exports = {};
  cache.set(name, exports);
  const javascript = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(javascript, {
    exports,
    require: pure,
    Date,
    Intl,
    Map,
    Set,
    Number,
    String,
    Math,
    Array,
  }, { filename: file });
  return exports;
}

const {
  assertRefundBreakdownReconciles,
  managementRefundMonthBounds,
  mapRefundBreakdownEntry,
  refundSourceLabel,
} = pure("@/engines/reports/refund-breakdown");
const { REFUND_METHOD_OPTIONS } = pure("@/engines/orders/refund-recording");
const { paymentMethodDisplayLabel } = pure("@/engines/orders/payment-details");

assert.equal(
  REFUND_METHOD_OPTIONS.find((row) => row.value === "online_transfer").value,
  "online_transfer",
  "stored refund method identifier is unchanged",
);
assert.equal(
  REFUND_METHOD_OPTIONS.find((row) => row.value === "online_transfer").label,
  "Online Transfer",
);
assert.equal(paymentMethodDisplayLabel("online_transfer"), "Online Transfer");
assert.equal(refundSourceLabel("order_refund"), "General Refund");
assert.equal(refundSourceLabel("overpayment_correction"), "Refund Overpayment");
assert.equal(refundSourceLabel("fresh_pick_cancellation"), "Fresh Pick Cancellation Refund");
assert.equal(refundSourceLabel("future_type"), "future_type", "unknown type is shown as stored");
assert.equal(refundSourceLabel(null), "Not recorded", "missing legacy type is not invented");

const refunds = [
  mapRefundBreakdownEntry({
    amount: 135,
    refundedAt: "2026-10-06T16:30:00.000Z",
    refundMethod: null,
    refundMethodDescription: null,
    refundType: "fresh_pick_cancellation",
    reason: "wrong payment",
  }, "ORD-20261007-0001", "wee"),
  mapRefundBreakdownEntry({
    amount: 20,
    refundedAt: "2026-10-15T02:00:00.000Z",
    refundMethod: "online_transfer",
    refundMethodDescription: null,
    refundType: "order_refund",
    reason: "Partial refund",
  }, "ORD-20261006-0002", "wee"),
  mapRefundBreakdownEntry({
    amount: 30,
    refundedAt: "2026-10-15T03:00:00.000Z",
    refundMethod: "cash",
    refundMethodDescription: null,
    refundType: "order_refund",
    reason: "Second partial refund",
  }, "ORD-20261006-0002", "wee"),
];
assert.deepEqual(Array.from(refunds, (row) => row.amount), [135, 20, 30]);
assert.equal(refunds.reduce((total, row) => total + row.amount, 0), 185);
assertRefundBreakdownReconciles(refunds, 185);
assert.throws(() => assertRefundBreakdownReconciles(refunds, 184.99), /does not reconcile/);
assert.equal(refunds[0].refundDate, "2026-10-07", "Malaysia-local date is used around UTC midnight");
assert.equal(refunds[0].method, "Not recorded", "legacy null method remains explicit");
assert.equal(refunds[0].source, "Fresh Pick Cancellation Refund");
assert.equal(refunds[1].method, "Online Transfer");
assert.equal(refunds[1].source, "General Refund");
assert.equal(refunds[2].recordedBy, "wee");
assert.equal(refunds[2].reason, "Second partial refund");
const bounds = managementRefundMonthBounds("2026-10");
assert.equal(bounds.start, "2026-10-01T00:00:00+08:00");
assert.equal(bounds.end, "2026-11-01T00:00:00+08:00");

const query = readFileSync("src/workspaces/owner/reports/queries.ts", "utf8");
assert.match(query, /\.from\("refunds"\)[\s\S]*?\.select\([\s\S]*?refund_method[\s\S]*?refund_type[\s\S]*?reason[\s\S]*?created_by/);
assert.match(query, /\.gte\("refunded_at", bounds\.start\)[\s\S]*?\.lt\("refunded_at", bounds\.end\)/);
assert.match(query, /row\.status\) === "recorded"/);
assert.match(query, /\.select\("id,display_name"\)/);
assert.doesNotMatch(query, /staff_profiles[\s\S]{0,100}email/);
assert.match(query, /assertRefundBreakdownReconciles\(refundBreakdown, cash\.refunds\)/);

const dashboard = readFileSync("src/workspaces/owner/reports/ManagementReportDashboard.tsx", "utf8");
assert.match(dashboard, /Refund Breakdown/);
assert.match(dashboard, /max-w-full overflow-x-auto/);
assert.match(dashboard, /min-w-\[960px\]/, "wide report table scroll stays inside its section on mobile");

console.log("Management refund breakdown, Malaysia dates, safe attribution, reconciliation, and mobile containment passed.");
