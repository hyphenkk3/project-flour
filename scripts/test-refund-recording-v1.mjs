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
  const file = [stem + ".ts", stem + ".tsx", stem + "/index.ts"].find(
    existsSync,
  );
  assert.ok(file, name);
  const exports = {};
  cache.set(name, exports);
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    js,
    { exports, require: pure, Date, Intl, Math, Number, String, RegExp },
    { filename: file },
  );
  return exports;
}

const { calculateOrderSettlement } = pure("@/engines/orders/settlement");
const { isRefundMethod, isValidRefundDate, todayMalaysiaDate } = pure(
  "@/engines/orders/refund-recording",
);
const { parseRefundAmount } = pure("@/engines/orders/payment-correction");
const { paymentCorrectionStatus } = pure("@/engines/orders/payment-correction");
const migration = readFileSync(
  "supabase/migrations/20261015010528_refund_recording_v1.sql",
  "utf8",
);
const actionSource = readFileSync(
  "src/workspaces/owner/orders/actions.ts",
  "utf8",
);
const paymentUi = readFileSync(
  "src/workspaces/owner/orders/PaymentSection.tsx",
  "utf8",
);
const lifecycleUi = readFileSync(
  "src/workspaces/owner/orders/OrderLifecycleActions.tsx",
  "utf8",
);
const reportSource = readFileSync("src/engines/reports/monthly.ts", "utf8");
const exportSource = readFileSync("src/engines/reports/export-data.ts", "utf8");
const pdfSource = readFileSync("src/workspaces/owner/reports/export/pdf.ts", "utf8");
const dashboardSource = readFileSync("src/workspaces/owner/reports/ManagementReportDashboard.tsx", "utf8");

const settlement = (status, due, paid, refunds = []) =>
  calculateOrderSettlement({
    orderStatus: status,
    items: [{ unitPrice: due, quantity: 1 }],
    adjustments: [],
    allocations: paid.map((amount) => ({ amount, paymentStatus: "verified" })),
    refunds: refunds.map((amount) => ({ amount, status: "recorded", refundType: "order_refund" })),
  });

// Goodwill refund reduces cash received but does not manufacture a debt.
const paidActive = settlement("paid", 125, [125], [20]);
assert.equal(paidActive.verifiedPaymentsAllocated, 125);
assert.equal(paidActive.refundsTotal, 20);
assert.equal(paidActive.netReceived, 105);
assert.equal(paidActive.remainingBalance, 0);
assert.equal(paidActive.remainingRefundable, 105);
assert.equal(paidActive.isFullyPaid, true);
assert.equal(paymentCorrectionStatus(paidActive), "none");

// A pre-existing unpaid amount remains genuine; refund is a separate outflow.
const partialActive = settlement("awaiting_payment", 260, [125], [20, 10]);
assert.equal(partialActive.genuineOutstanding, 135);
assert.equal(partialActive.remainingBalance, 135);
assert.equal(partialActive.netReceived, 95);
assert.equal(partialActive.remainingRefundable, 95);

// Non-collectible statuses expose no collectible balance while retaining the
// genuine historical shortfall for transparent display.
const cancelled = settlement("cancelled", 260, [125]);
assert.equal(cancelled.genuineOutstanding, 135);
assert.equal(cancelled.remainingBalance, 0);
const completed = settlement("completed", 125, [125], [25]);
assert.equal(completed.remainingBalance, 0);
assert.equal(completed.netReceived, 100);
const overpaymentRefund = calculateOrderSettlement({
  items: [{ unitPrice: 100, quantity: 1 }],
  adjustments: [],
  allocations: [{ amount: 120, paymentStatus: "verified" }],
  refunds: [
    { amount: 20, status: "recorded", refundType: "overpayment_correction" },
  ],
});
assert.equal(overpaymentRefund.overpaymentRefundsTotal, 20);
assert.equal(paymentCorrectionStatus(overpaymentRefund), "full");

assert.equal(parseRefundAmount("125"), 125);
assert.equal(parseRefundAmount("0.01"), 0.01);
for (const invalid of ["0", "-1", "1.001", "1e2", "01.00", "NaN"]) {
  assert.equal(parseRefundAmount(invalid), null, `reject ${invalid}`);
}
for (const method of ["online_transfer", "wb_qr", "cash", "others"])
  assert.equal(isRefundMethod(method), true);
assert.equal(isRefundMethod("card"), false);
assert.equal(isValidRefundDate("2026-10-14", "2026-10-15"), true);
assert.equal(isValidRefundDate("2026-10-15", "2026-10-15"), true);
assert.equal(isValidRefundDate("2026-10-16", "2026-10-15"), false);
assert.equal(isValidRefundDate("2026-02-30", "2026-10-15"), false);
assert.match(todayMalaysiaDate(new Date("2026-10-14T17:00:00.000Z")), /^2026-10-15$/);

// Static security/transaction checks: integration with hosted Postgres is
// intentionally not run in this source-only phase.
const generalRpc = migration.split("create or replace function public.record_order_refund(")[1].split("$$;")[0];
assert.match(generalRpc, /security definer/i);
assert.match(generalRpc, /set search_path = ''/i);
assert.match(generalRpc, /_bind_rpc_actor\(null\)/);
assert.match(generalRpc, /array\['owner', 'manager'\]/);
assert.match(generalRpc, /where o\.id = p_order_id\s+for update/i);
assert.match(generalRpc, /order_verified_allocated\(p_order_id\)/);
assert.match(generalRpc, /order_refunds_total\(p_order_id\)/);
assert.match(generalRpc, /insert into public\.order_timeline_events/);
assert.doesNotMatch(generalRpc, /update public\.orders|update public\.payments|delete from public\.(refunds|payments|payment_allocations)/i);
assert.match(migration, /drop policy if exists refunds_authenticated_insert on public\.refunds/i);
assert.match(migration, /revoke insert, update, delete, truncate, references, trigger\s+on table public\.refunds from public, anon, authenticated, service_role/i);
assert.match(migration, /grant select on table public\.refunds to authenticated/i);
assert.match(migration, /grant execute on function public\.record_order_refund[\s\S]*?to authenticated/i);
assert.doesNotMatch(migration, /alter function public\.cancel_and_refund_paid_fresh_pick[\s\S]*rename/i);
assert.doesNotMatch(migration, /revoke all on function public\.cancel_and_refund_paid_fresh_pick\(/i);
assert.doesNotMatch(migration, /revoke all on function public\.record_overpayment_refund\(/i);
assert.match(migration, /create or replace function public\.record_overpayment_refund_with_details/);
assert.match(migration, /public\.record_overpayment_refund\(/);
assert.match(migration, /refund_type = 'overpayment_correction'/);
assert.match(migration, /order_amount[\s\S]*order_refunds_total[\s\S]*Refund exceeds remaining overpayment/i);
assert.match(migration, /v_order\.extra_stock_id is not null[\s\S]*Fresh Pick refunds must use the Owner cancellation/i);
assert.match(migration, /array\['owner'\]/);
assert.match(migration, /cancel_and_refund_paid_fresh_pick_with_details/);
assert.match(migration, /update public\.refunds[\s\S]*refund_method = p_method/);
assert.match(migration, /refund_type = 'fresh_pick_cancellation'/);
assert.match(actionSource, /record_order_refund/);
assert.doesNotMatch(actionSource.slice(actionSource.indexOf("export async function recordRefundAction"), actionSource.indexOf("export async function", actionSource.indexOf("export async function recordRefundAction") + 1)), /scheduleStaffNotificationDispatch/);
assert.match(paymentUi, /canRecordPaymentCorrection && remainingRefundable > 0 && !order\.extraStockId/);
assert.match(paymentUi, /Record General Refund/);
assert.match(paymentUi, /Refund Overpayment/);
const financialFormSwitch = paymentUi.match(
  /const openFinancialForm = \([\s\S]*?\n  \};/,
)?.[0] ?? "";
assert.ok(financialFormSwitch, "financial form switch exists");
assert.match(financialFormSwitch, /setShowRecord\(form === "record"\)/);
assert.match(financialFormSwitch, /setShowRefund\(form === "refund"\)/);
assert.match(financialFormSwitch, /setShowExtend\(form === "extend"\)/);
assert.match(financialFormSwitch, /form === "correction"/);
assert.doesNotMatch(financialFormSwitch, /rpc\(|Action\(/);
assert.match(paymentUi, /openFinancialForm\("correction", row\.id\)/);
assert.match(paymentUi, /openFinancialForm\("record"\)/);
assert.equal((paymentUi.match(/openFinancialForm\("refund"\)/g) ?? []).length, 2);
assert.match(paymentUi, /openFinancialForm\(showExtend \? "none" : "extend"\)/);
assert.match(actionSource, /record_overpayment_refund_with_details/);
assert.match(actionSource, /Fresh Pick refunds must use the Owner cancellation and refund workflow/);
const overpaymentAction = actionSource.slice(
  actionSource.indexOf("export async function recordOverpaymentRefundAction"),
  actionSource.indexOf("// ---------------------------------------------------------------------------", actionSource.indexOf("export async function recordOverpaymentRefundAction")),
);
const requestPrecheck = overpaymentAction.indexOf('.select("id")');
const refundRpc = overpaymentAction.indexOf('rpc("record_overpayment_refund_with_details"');
const notificationSchedule = overpaymentAction.indexOf("scheduleStaffNotificationDispatch()");
assert.ok(requestPrecheck >= 0 && requestPrecheck < refundRpc, "request-key precheck runs before the refund RPC");
assert.ok(refundRpc < notificationSchedule, "notification scheduling follows the refund RPC");
assert.match(overpaymentAction, /if \(requestLookupError\)[\s\S]*?return \{ error: requestLookupError\.message, success: false \}/);
assert.match(overpaymentAction, /if \(error\) return \{ error: error\.message, success: false \};[\s\S]*?if \(!existingRequest\) \{\s*scheduleStaffNotificationDispatch\(\);\s*\}/);
assert.match(lifecycleUi, /cancelAndRefundFreshPickAction[\s\S]*freshPickRefundMethod/);
assert.match(reportSource, /netReceipts: sum\(\[collected, -refundsTotal\]\)/);
assert.match(exportSource, /\["Payments", "Net Receipts"/);
assert.match(exportSource, /Outstanding for Selected Month/);
assert.match(dashboardSource, /Outstanding for Selected Month/);
assert.match(pdfSource, /Outstanding for Selected Month/);
assert.match(pdfSource, /byName\.get\("Payments"\)/);

console.log("PASS Refund Recording V1 calculation, validation, authorization, audit and report guards");
