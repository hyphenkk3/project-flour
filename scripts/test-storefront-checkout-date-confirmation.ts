/**
 * Checkout date confirmation uses one server action and a slim cake list.
 * Run: npx tsx scripts/test-storefront-checkout-date-confirmation.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const queriesSrc = readSrc("src/workspaces/storefront/catalog/queries.ts");
const hoursSrc = readSrc(
  "src/workspaces/library/operating-hours/queries.ts",
);
const summarySrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);

assert.match(formSrc, /loadCheckoutDateConfirmation\(/);
assert.match(formSrc, /Confirming collection dates/);
assert.match(formSrc, /Confirming opening hours/);
assert.match(summarySrc, /Checking availability for that date/);
assert.match(formSrc, /date_confirmation_start/);
assert.match(formSrc, /date_confirmed/);
assert.match(formSrc, /void loadCheckoutPickupOffer\(pickupDate\)/);
assert.match(formSrc, /void loadCheckoutVenuePhotos\(\)/);

const confirmFn = actionsSrc.slice(
  actionsSrc.indexOf("export async function loadCheckoutDateConfirmation"),
  actionsSrc.indexOf(
    "export async function resolveCheckoutCakeSizePrices",
  ),
);
assert.match(confirmFn, /includeVenuePhotos: false/);
assert.match(confirmFn, /includeOptions: false/);
assert.match(confirmFn, /cakeIds: input\.cakeIds/);
assert.match(confirmFn, /logPerf\("CHECKOUT_DATE", "date_confirmation"/);
assert.match(confirmFn, /runWithCheckoutDatePerf/);
assert.match(confirmFn, /snapshotCheckoutDateConfirmationPerf/);
assert.match(confirmFn, /timeCheckoutDateStage\("promise_all"/);
assert.doesNotMatch(confirmFn, /listAvailableCheckoutCakes/);
assert.match(formSrc, /logCheckoutDateConfirmationWaterfall/);
assert.match(formSrc, /client_wait_ms/);

const serverSrc = readSrc("src/lib/supabase/server.ts");
assert.match(serverSrc, /recordCheckoutDateDbCall/);
assert.match(serverSrc, /recordCheckoutDateCookies/);
assert.match(serverSrc, /fetchForCheckoutDateTiming/);

const offerFn = actionsSrc.slice(
  actionsSrc.indexOf("export async function loadCheckoutPickupOffer"),
  actionsSrc.indexOf("export async function loadCheckoutDateConfirmation"),
);
assert.match(offerFn, /listAvailableCheckoutCakes/);
assert.match(offerFn, /listCheckoutCakesForCakeIds/);
assert.match(offerFn, /getStorefrontCollectionForPickupDate/);
assert.match(offerFn, /timeCheckoutDateStage\("collection"/);
assert.match(offerFn, /timeCheckoutDateStage\("cakes"/);
assert.match(offerFn, /Promise\.all\(\[/);
assert.doesNotMatch(offerFn, /listAvailableCakes\(/);

const calendarFn = actionsSrc.slice(
  actionsSrc.indexOf("export async function loadCheckoutCalendarContext"),
  actionsSrc.indexOf("export async function loadCheckoutVenuePhotos"),
);
assert.match(calendarFn, /catalogueIndex/);
assert.match(calendarFn, /listClosedPickupOrderDates/);
assert.match(calendarFn, /includeVenuePhotos/);

const cartCakesFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listCheckoutCakesForCakeIds"),
  queriesSrc.indexOf("async function loadHomepageCollectionPreviewCakes"),
);
assert.match(cartCakesFn, /library_cake_id/);
assert.doesNotMatch(cartCakesFn, /library_cake_photos/);

const checkoutCakesFn = queriesSrc.slice(
  queriesSrc.indexOf("export async function listAvailableCheckoutCakes"),
  queriesSrc.indexOf("async function loadHomepageCollectionPreviewCakes"),
);
assert.match(checkoutCakesFn, /library_cake_sizes \(/);
assert.doesNotMatch(checkoutCakesFn, /library_cake_photos/);

assert.match(hoursSrc, /const \[weeklyResult, overrideResult\] = await Promise\.all\(/);

assert.match(formSrc, /useEligibleCatalogueVoucher\(catalogueVoucherDraft, "preorder"/);
assert.match(formSrc, /enabled: calendarReady/);
assert.match(formSrc, /if \(!hydrated \|\| !calendarReady\) return;/);
assert.doesNotMatch(
  confirmFn,
  /listPublicCatalogueVouchersAction|evaluateCatalogueVoucherEligibility/,
);

console.log("PASS storefront checkout date confirmation");
