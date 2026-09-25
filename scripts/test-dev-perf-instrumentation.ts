/**
 * Phase 2A: DEV-only performance instrumentation must not change
 * checkout, voucher, settlement, or receipt behavior.
 * Run: npx tsx scripts/test-dev-perf-instrumentation.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PERF_CORRELATION_PATTERN,
  acceptPerfCorrelationId,
  createPerfCorrelationId,
  formatPerfLine,
  isDevPerfEnabled,
} from "@/lib/perf/dev-only-shared";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const voucherActionsSrc = readSrc("src/workspaces/vouchers/catalogue-actions.ts");
const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const pageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
const helperSrc = readSrc("src/lib/perf/dev-only-shared.ts");
const serverHelperSrc = readSrc("src/lib/perf/dev-only-server.ts");

assert.equal(PERF_CORRELATION_PATTERN.test(createPerfCorrelationId()), true);
assert.equal(acceptPerfCorrelationId("pabcdef0123"), "pabcdef0123");
assert.equal(PERF_CORRELATION_PATTERN.test(acceptPerfCorrelationId("nope")), true);
assert.match(
  formatPerfLine("CHECKOUT_SUBMIT", ["correlationId=p1", "step=TOTAL"]),
  /^\[PERF\]\[CHECKOUT_SUBMIT\] correlationId=p1 step=TOTAL$/,
);
assert.match(helperSrc, /tzwtpxdcggesgjaqxkqr/);
assert.match(helperSrc, /NODE_ENV === "development"/);
assert.match(serverHelperSrc, /isDevPerfEnabled\(\)/);
assert.equal(typeof isDevPerfEnabled(), "boolean");

assert.match(actionsSrc, /export async function submitGuestPreorderAction/);
assert.match(actionsSrc, /logPerfSkipped\("CHECKOUT_SUBMIT", "isPickupOrdersClosed"\)/);
assert.match(actionsSrc, /logPerfSkipped\("CHECKOUT_SUBMIT", "loadOperatingHoursSnapshot"\)/);
assert.match(actionsSrc, /submit_guest_preorder/);
assert.match(actionsSrc, /submit_guest_preorder_with_catalogue_voucher/);
assert.match(actionsSrc, /await setGuestPreorderReceiptCookie\(orderId\)/);
assert.match(actionsSrc, /applyGuestCatalogueVoucherAction/);
assert.match(actionsSrc, /voucherApply: "executed"/);
assert.match(actionsSrc, /voucherApply: "skipped"/);
assert.match(actionsSrc, /\[PERF\]\[CHECKOUT_SUBMIT\]|logPerf\("CHECKOUT_SUBMIT"/);
assert.doesNotMatch(actionsSrc, /evaluateCatalogueVoucherEligibility/);

assert.match(voucherActionsSrc, /Client-provided discount amounts are not accepted/);
assert.match(voucherActionsSrc, /already applied/);
assert.match(
  voucherActionsSrc,
  /apply_catalogue_voucher_to_guest_order/,
);
assert.match(voucherActionsSrc, /evaluateCatalogueVoucherEligibility/);
assert.doesNotMatch(voucherActionsSrc, /revalidatePath\("\/order\/success"\)/);
assert.doesNotMatch(voucherActionsSrc, /getGuestPreorderReceipt\(/);
assert.match(voucherActionsSrc, /loadCatalogueApplyOrder\(input.orderId\)/);
assert.match(voucherActionsSrc, /getCatalogueVoucherForApply\(input.voucherId\)/);
assert.doesNotMatch(voucherActionsSrc, /clientAmount != null \? input.clientAmount/);

assert.match(receiptSrc, /order_adjustments/);
assert.match(receiptSrc, /getEffectiveAdjustments/);
assert.match(receiptSrc, /calculateOrderSettlement/);
assert.match(receiptSrc, /library_cake_photos/);
assert.match(receiptSrc, /\.is\("customer_id", null\)/);
assert.doesNotMatch(receiptSrc, /evaluateCatalogueVoucher/);
assert.doesNotMatch(receiptSrc, /apply_catalogue_voucher_to_guest_order/);
assert.doesNotMatch(receiptSrc, /\.insert\(/);

assert.match(successSrc, /getGuestPreorderReceipt/);
assert.match(successSrc, /loadSuccessPageReceipt/);
assert.match(successSrc, /<StorefrontSuccessPerfProbe \/>/);
assert.match(successSrc, /receipt \? <SaveOrderDetailsButton receipt=\{receipt\} \/>/);
assert.match(formSrc, /router\.replace\(`\/order\/success\?order=\$\{orderId\}`\)/);
assert.match(formSrc, /Preparing your preorder…/);
assert.match(pageSrc, /Preparing your preorder…/);
assert.match(formSrc, /beginCheckoutSubmitPerf/);
assert.match(extraFormSrc, /beginCheckoutSubmitPerf/);
assert.match(extraFormSrc, /router\.replace\(/);
assert.match(extraActionsSrc, /await supabase.rpc\("submit_guest_extra_order"/);
assert.match(extraActionsSrc, /applyGuestCatalogueVoucherAction/);

console.log("PASS dev perf instrumentation");
