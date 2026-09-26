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
  attachCheckoutServerPerf,
  createPerfCorrelationId,
  formatPerfLine,
  isDevPerfEnabled,
} from "@/lib/perf/dev-only-shared";
import {
  elapsedPerfMs,
  markCheckoutActionReturned,
  markCheckoutNavigationCall,
  readActiveSuccessNavigation,
  readCheckoutSubmitTiming,
  resetCheckoutAttemptTiming,
  resolveCheckoutLoadClock,
  startCheckoutAttemptTiming,
} from "@/lib/perf/dev-only-client";
import {
  consumeStorefrontNavIntent,
  markStorefrontNavIntent,
  resetStorefrontNavIntentForTests,
} from "@/lib/perf/storefront-nav-client";

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
const clientHelperSrc = readSrc("src/lib/perf/dev-only-client.ts");
const successLoadSrc = readSrc(
  "src/workspaces/storefront/checkout/success-page-load.ts",
);
const probeSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPerfProbe.tsx",
);
const checkoutPerfSrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutDevPerf.tsx",
);

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
assert.match(receiptSrc, /source: "deferred_client"/);
assert.match(receiptSrc, /loadReceiptCakePhotos/);
assert.doesNotMatch(
  receiptSrc,
  /const ordersStarted = performance\.now\(\);\s*const adjustmentsStarted = performance\.now\(\);/,
);
assert.match(
  receiptSrc,
  /async \(\) => \{\s*const started = performance\.now\(\);[\s\S]*orders_query/,
);
assert.match(
  receiptSrc,
  /async \(\) => \{\s*const started = performance\.now\(\);[\s\S]*order_adjustments/,
);
assert.match(clientHelperSrc, /CHECKOUT_SUCCESS_PHOTO/);
assert.match(clientHelperSrc, /CHECKOUT_NAV/);
assert.match(
  readSrc("src/workspaces/storefront/checkout/SuccessReceiptPhotos.tsx"),
  /CHECKOUT_SUCCESS_PHOTO/,
);
assert.match(probeSrc, /CHECKOUT_NAV/);
assert.match(probeSrc, /useLayoutEffect/);
assert.match(probeSrc, /successPageNavigationToClientCommitMs/);
assert.match(probeSrc, /successPageNavigationToVisibleMs/);
assert.match(probeSrc, /readActiveSuccessNavigation/);
assert.match(probeSrc, /actionReturnToNavigationCallMs/);
assert.match(probeSrc, /confirmToSuccessVisibleMs/);
assert.match(probeSrc, /same_document_navigation_from_router_replace/);
assert.match(probeSrc, /success_navigation_timing_unavailable_new_document/);
assert.doesNotMatch(probeSrc, /successPageClientCommitMs/);
assert.doesNotMatch(probeSrc, /successPageClientVisibleMs/);
assert.doesNotMatch(probeSrc, /successPageStartToVisibleMs/);
assert.doesNotMatch(probeSrc, /navigationStartToServerStartMs/);
assert.doesNotMatch(probeSrc, /navigationStartToSuccessVisibleMs/);
assert.doesNotMatch(probeSrc, /Date\.now\(\)/);
assert.match(
  formSrc,
  /useLayoutEffect\(\(\) => \{[\s\S]*beginSuccessNavigationPerf/,
);
assert.match(
  extraFormSrc,
  /useLayoutEffect\(\(\) => \{[\s\S]*beginSuccessNavigationPerf/,
);
assert.match(receiptSrc, /\.is\("customer_id", null\)/);
assert.doesNotMatch(receiptSrc, /evaluateCatalogueVoucher/);
assert.doesNotMatch(receiptSrc, /apply_catalogue_voucher_to_guest_order/);
assert.doesNotMatch(receiptSrc, /\.insert\(/);

assert.match(successSrc, /getGuestPreorderReceipt/);
assert.match(successSrc, /loadSuccessPageReceipt/);
assert.match(successSrc, /<StorefrontSuccessPerfProbe/);
assert.match(successSrc, /markVisible/);
assert.match(successSrc, /<Suspense/);
assert.match(successSrc, /<SuccessReceiptRecap orderId=\{orderId\} receipt=\{receipt\} \/>/);
assert.match(
  readSrc("src/workspaces/storefront/checkout/SuccessReceiptPhotos.tsx"),
  /SaveOrderDetailsButton/,
);
assert.doesNotMatch(successSrc, /<StorefrontTheme/);
assert.match(formSrc, /router\.replace\(`\/order\/success\?order=\$\{orderId\}`\)/);
assert.match(formSrc, /Preparing your preorder…/);
assert.match(pageSrc, /Preparing your preorder…/);
assert.match(formSrc, /submitGuestOrderAndNavigate/);
assert.match(extraFormSrc, /submitGuestOrderAndNavigate/);
assert.match(checkoutPerfSrc, /submitGuestOrderAndNavigate/);
assert.match(checkoutPerfSrc, /markCheckoutActionReturned/);
assert.match(checkoutPerfSrc, /server_action_promise_resolved/);
assert.match(checkoutPerfSrc, /startCheckoutAttemptTiming/);
assert.match(checkoutPerfSrc, /actionReturnToNavigationCallMs/);
assert.match(checkoutPerfSrc, /elapsedPerfMs/);
assert.doesNotMatch(checkoutPerfSrc, /navigationStartAt/);
assert.doesNotMatch(checkoutPerfSrc, /writeCheckoutSubmitTiming/);
assert.doesNotMatch(checkoutPerfSrc, /Date\.now\(\)/);
assert.match(clientHelperSrc, /confirmClickMs/);
assert.match(clientHelperSrc, /clientActionDispatchMs/);
assert.match(clientHelperSrc, /actionReturnToNavigationCallMs/);
assert.match(clientHelperSrc, /elapsedPerfMs/);
assert.match(clientHelperSrc, /startCheckoutAttemptTiming/);
assert.match(clientHelperSrc, /readActiveSuccessNavigation/);
assert.match(clientHelperSrc, /activeSuccessNavigation/);
assert.match(clientHelperSrc, /wb-perf-checkout-correlation-v2/);
assert.match(clientHelperSrc, /JSON\.stringify\(\{ correlationId, flow \}\)/);
assert.doesNotMatch(
  clientHelperSrc,
  /sessionStorage\.setItem\([^;]*navigationCallAt/,
);
assert.match(clientHelperSrc, /sessionStorage\.removeItem\(LEGACY_SUBMIT_STORAGE_KEY\)/);
assert.doesNotMatch(clientHelperSrc, /navigationStartAt/);
assert.doesNotMatch(clientHelperSrc, /writeCheckoutSubmitTiming/);
assert.match(
  readSrc("src/workspaces/storefront/checkout/SuccessReceiptPhotos.tsx"),
  /readCheckoutCorrelationId/,
);
assert.doesNotMatch(
  readSrc("src/workspaces/storefront/checkout/SuccessReceiptPhotos.tsx"),
  /readCheckoutSubmitTiming/,
);
assert.match(extraFormSrc, /router\.replace\(/);
assert.match(extraActionsSrc, /await supabase.rpc\("submit_guest_extra_order"/);
assert.match(extraActionsSrc, /applyGuestCatalogueVoucherAction/);

assert.match(actionsSrc, /withDevCheckoutPerf/);
assert.match(extraActionsSrc, /withDevCheckoutPerf/);
assert.match(actionsSrc, /perf\?: CheckoutServerPerf/);
assert.match(serverHelperSrc, /snapshotDevCheckoutPerf/);
assert.match(serverHelperSrc, /isDevPerfEnabled\(\)/);
assert.match(helperSrc, /attachCheckoutServerPerf/);
assert.match(clientHelperSrc, /CHECKOUT_SERVER_SUMMARY/);
assert.match(clientHelperSrc, /resolveCheckoutLoadClock/);
assert.match(checkoutPerfSrc, /logCheckoutServerPerf/);
assert.match(formSrc, /useCheckoutActionReturnPerf\(pending, "preorder", state\.perf\)/);
assert.match(extraFormSrc, /useCheckoutActionReturnPerf\(pending, "extra", state\.perf\)/);
assert.match(successSrc, /successServer=\{perf\}/);
assert.match(successLoadSrc, /serverRequestAt/);
assert.match(successLoadSrc, /serverReceiptDataMs/);
assert.match(successLoadSrc, /serverRenderMs/);
assert.match(successLoadSrc, /snapshotDevCheckoutPerf/);
assert.match(probeSrc, /CHECKOUT_SUCCESS_SERVER/);
assert.match(probeSrc, /consumeCheckoutServerLogKey/);
assert.match(actionsSrc, /acceptPerfCorrelationId/);
assert.doesNotMatch(actionsSrc, /createPerfCorrelationId\(\)/);

const baseState = { error: null as string | null, orderId: "order-1" };
const samplePerf = {
  correlationId: "pabcdef0123",
  totalServerMs: 1240,
  steps: [
    { name: "submit_guest_preorder_with_catalogue_voucher", ms: 1102 },
    { name: "setGuestPreorderReceiptCookie", ms: 38 },
  ],
};
const withPerf = attachCheckoutServerPerf(baseState, samplePerf, true);
assert.equal(withPerf.error, null);
assert.equal(withPerf.orderId, "order-1");
assert.equal(withPerf.perf?.correlationId, "pabcdef0123");
assert.equal(withPerf.perf?.totalServerMs, 1240);
assert.equal(typeof withPerf.perf?.totalServerMs, "number");
assert.equal(withPerf.perf?.steps[0]?.ms, 1102);
const withoutPerf = attachCheckoutServerPerf(baseState, samplePerf, false);
assert.equal("perf" in withoutPerf, false);
assert.equal(withoutPerf.error, null);
assert.equal(withoutPerf.orderId, "order-1");
const omitted = attachCheckoutServerPerf(baseState, undefined, true);
assert.equal("perf" in omitted, false);

assert.equal(acceptPerfCorrelationId("pabcdef0123"), "pabcdef0123");
assert.equal(samplePerf.correlationId, acceptPerfCorrelationId("pabcdef0123"));

const sameDocument = resolveCheckoutLoadClock({
  stored: { startedAt: 1_000, timeOrigin: 500 },
  now: 1_500,
  timeOrigin: 500,
});
assert.equal(sameDocument.reset, false);
assert.equal(sameDocument.clock.startedAt, 1_000);
const newDocument = resolveCheckoutLoadClock({
  stored: { startedAt: 1_000, timeOrigin: 500 },
  now: 20_000,
  timeOrigin: 10_000,
});
assert.equal(newDocument.reset, true);
assert.equal(newDocument.clock.startedAt, 20_000);
const staleVisit = resolveCheckoutLoadClock({
  stored: { startedAt: 1_000, timeOrigin: 500 },
  now: 1_000 + 31 * 60 * 1000,
  timeOrigin: 500,
});
assert.equal(staleVisit.reset, true);

assert.equal(elapsedPerfMs(10, 20), 10);
assert.equal(elapsedPerfMs(20, 10), null);
assert.equal(elapsedPerfMs(null, 20), null);
assert.equal(elapsedPerfMs(10, null), null);
assert.equal(elapsedPerfMs(Number.NaN, 20), null);
assert.equal(elapsedPerfMs(0, 3_109_627), null);
assert.equal(elapsedPerfMs(3_109_627, 0), null);

resetCheckoutAttemptTiming();
assert.equal(readCheckoutSubmitTiming(), null);
const firstAttempt = startCheckoutAttemptTiming("pfirst00001", "preorder");
assert.equal(firstAttempt.correlationId, "pfirst00001");
assert.equal(firstAttempt.actionReturnAt, null);
assert.equal(firstAttempt.navigationCallAt, null);
assert.equal(readCheckoutSubmitTiming()?.correlationId, "pfirst00001");
const secondAttempt = startCheckoutAttemptTiming("psecond0002", "extra");
assert.equal(secondAttempt.correlationId, "psecond0002");
assert.equal(secondAttempt.flow, "extra");
assert.equal(readCheckoutSubmitTiming()?.correlationId, "psecond0002");
assert.notEqual(firstAttempt.correlationId, secondAttempt.correlationId);
assert.equal(elapsedPerfMs(firstAttempt.confirmClickAt, secondAttempt.confirmClickAt) != null, true);
resetCheckoutAttemptTiming();
assert.equal(readCheckoutSubmitTiming(), null);
assert.equal(readActiveSuccessNavigation("pfirst00001"), null);

const navAttempt = startCheckoutAttemptTiming("pnav0000001", "preorder");
assert.equal(readActiveSuccessNavigation("pnav0000001"), null);
markCheckoutActionReturned();
const afterReturn = readCheckoutSubmitTiming();
assert.ok(afterReturn?.actionReturnAt != null);
const afterNavCall = markCheckoutNavigationCall();
assert.ok(afterNavCall?.navigationCallAt != null);
assert.equal(
  elapsedPerfMs(afterReturn?.actionReturnAt, afterNavCall?.navigationCallAt) !=
    null,
  true,
);
const matchedNav = readActiveSuccessNavigation("pnav0000001");
assert.equal(matchedNav?.correlationId, "pnav0000001");
assert.equal(matchedNav?.navigationCallAt, afterNavCall?.navigationCallAt);
assert.equal(readActiveSuccessNavigation("pother00001"), null);
assert.equal(readActiveSuccessNavigation(null), null);
const visibleAt = afterNavCall!.navigationCallAt + 850;
assert.equal(
  elapsedPerfMs(matchedNav?.navigationCallAt, visibleAt),
  850,
);
assert.equal(
  elapsedPerfMs(navAttempt.confirmClickAt, visibleAt) != null,
  true,
);
startCheckoutAttemptTiming("pnav0000002", "preorder");
assert.equal(readActiveSuccessNavigation("pnav0000001"), null);
assert.equal(readActiveSuccessNavigation("pnav0000002"), null);
resetCheckoutAttemptTiming();
assert.equal(readActiveSuccessNavigation("pnav0000002"), null);

resetStorefrontNavIntentForTests();
assert.equal(
  consumeStorefrontNavIntent({ href: "/browse", kinds: ["browse"] }),
  null,
);
const marked = markStorefrontNavIntent("/browse", "browse");
assert.ok(marked?.correlationId);
assert.equal(
  consumeStorefrontNavIntent({ href: "/cakes/x", kinds: ["browse"] }),
  null,
);
const consumed = consumeStorefrontNavIntent({
  href: "/browse",
  kinds: ["browse", "back"],
});
assert.equal(consumed?.correlationId, marked?.correlationId);
assert.equal(consumed?.kind, "browse");
assert.equal(typeof consumed?.intentToVisibleMs, "number");
assert.equal(
  consumeStorefrontNavIntent({ href: "/browse", kinds: ["browse"] }),
  null,
);
resetStorefrontNavIntentForTests();

const navClientSrc = readSrc("src/lib/perf/storefront-nav-client.ts");
assert.match(navClientSrc, /timeOrigin/);
assert.match(navClientSrc, /elapsedPerfMs/);
assert.doesNotMatch(navClientSrc, /Date\.now\(\)/);

console.log("PASS dev perf instrumentation");
