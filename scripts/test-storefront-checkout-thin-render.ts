/**
 * Checkout Phase 3: thin initial server render.
 * Run: npx tsx scripts/test-storefront-checkout-thin-render.ts
 *
 * Does not submit orders or mutate catalogues.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isCheckoutCalendarPending,
  isCheckoutLiveOfferPending,
} from "@/workspaces/storefront/checkout/checkout-draft-availability";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const pageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const extraPageSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraCheckoutPage.tsx",
);

assert.doesNotMatch(pageSrc, /listOrderableMonthlyCatalogues/);
assert.doesNotMatch(pageSrc, /listCustomerSpecialCatalogues/);
assert.doesNotMatch(pageSrc, /listClosedPickupOrderDates/);
assert.doesNotMatch(pageSrc, /loadOperatingHoursSnapshot/);
assert.doesNotMatch(pageSrc, /await /);
assert.match(pageSrc, /resolveCheckoutPickupScope/);
assert.match(pageSrc, /globalMax: null/);
assert.match(pageSrc, /GuestCheckoutForm/);

assert.match(formSrc, /loadCheckoutCalendarContext/);
assert.match(formSrc, /Confirming collection dates/);
assert.match(formSrc, /Confirming opening hours/);
assert.match(formSrc, /calendarPending/);
assert.match(formSrc, /isCheckoutCalendarPending/);
assert.match(formSrc, /if \(calendarPending \|\| liveOfferPending\)/);
assert.match(formSrc, /loadCheckoutPickupOffer/);
assert.match(formSrc, /liveOfferPending/);
assert.doesNotMatch(formSrc, /Loading cakes for that date/);

assert.match(actionsSrc, /export async function loadCheckoutCalendarContext/);
assert.match(actionsSrc, /Promise\.all\(/);
assert.match(actionsSrc, /listOrderableMonthlyCatalogues/);
assert.match(actionsSrc, /loadOperatingHoursSnapshot/);
assert.match(actionsSrc, /listClosedPickupOrderDates/);
assert.match(actionsSrc, /getCustomerCakePickupMemberships/);
assert.match(actionsSrc, /export async function submitGuestPreorderAction/);
assert.match(actionsSrc, /await loadOperatingHoursSnapshot\(\)/);
assert.match(actionsSrc, /await isPickupOrdersClosed\(pickupDate\)/);
assert.match(actionsSrc, /getStorefrontCollectionForPickupDate/);
assert.match(actionsSrc, /listAvailableCakes/);
assert.match(actionsSrc, /loadCustomerCartDateCapacity/);

assert.doesNotMatch(extraPageSrc, /loadCheckoutCalendarContext/);
assert.doesNotMatch(extraPageSrc, /StorefrontCheckoutPage/);

assert.equal(isCheckoutCalendarPending(false), true);
assert.equal(isCheckoutCalendarPending(true), false);
assert.equal(isCheckoutLiveOfferPending("2026-09-18", null), true);

const submitStart = actionsSrc.indexOf(
  "export async function submitGuestPreorderAction",
);
const submitFn = actionsSrc.slice(
  submitStart,
  actionsSrc.indexOf(
    "\nexport async function",
    submitStart + "export async function submitGuestPreorderAction".length,
  ),
);
assert.match(submitFn, /loadOperatingHoursSnapshot/);
assert.match(submitFn, /isPickupOrdersClosed/);
assert.match(submitFn, /getStorefrontCollectionForPickupDate/);
assert.match(submitFn, /listAvailableCakes/);
assert.match(submitFn, /loadLivePreorderDaysBySizeId/);
assert.match(submitFn, /loadCustomerCartDateCapacity/);
assert.match(submitFn, /evaluateCollectionDate/);
assert.doesNotMatch(submitFn, /loadCheckoutCalendarContext/);

console.log("PASS storefront checkout thin render");
