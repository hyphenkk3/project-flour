/**
 * Phase 2 — checkout route loading shell (static).
 * Run: npx tsx scripts/test-storefront-checkout-loading.ts
 *
 * Does not call Supabase or mutate catalogues, carts, or orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const loadingRoute = "src/app/order/checkout/loading.tsx";
const loadingShell =
  "src/workspaces/storefront/checkout/StorefrontCheckoutLoading.tsx";
const checkoutPage =
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx";
const checkoutRoute = "src/app/order/checkout/page.tsx";
const cartSrcPath = "src/workspaces/storefront/cart/StorefrontCartShell.tsx";
const extraCheckout = "src/app/extra/checkout/page.tsx";
const extraLoading = "src/app/extra/checkout/loading.tsx";
const draftSrc = "src/workspaces/storefront/checkout/preorder-draft.ts";
const actionsSrc = "src/workspaces/storefront/checkout/actions.ts";
const summarySrc =
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx";
const formSrc = "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx";

assert.equal(existsSync(resolve(process.cwd(), loadingRoute)), true);
assert.equal(existsSync(resolve(process.cwd(), loadingShell)), true);
assert.equal(existsSync(resolve(process.cwd(), extraLoading)), false);

const loadingRouteSrc = readSrc(loadingRoute);
const loadingShellSrc = readSrc(loadingShell);
const combined = `${loadingRouteSrc}\n${loadingShellSrc}`;
const cartSrc = readSrc(cartSrcPath);

assert.match(loadingRouteSrc, /StorefrontCheckoutLoading/);
assert.doesNotMatch(loadingRouteSrc, /["']use client["']/);
assert.doesNotMatch(loadingShellSrc, /["']use client["']/);

assert.doesNotMatch(combined, /createClient|supabase|from\("/);
assert.doesNotMatch(combined, /cookies\(|sessionStorage|localStorage/);
assert.doesNotMatch(combined, /fetch\(|loadCheckoutPickupOffer|listAvailableCakes/);
assert.doesNotMatch(combined, /listOrderableMonthlyCatalogues|listClosedPickupOrderDates/);
assert.doesNotMatch(combined, /next\/image|CakePhotoImage/);
assert.doesNotMatch(combined, /useEffect|useState|useRouter|usePreorderDraft/);
assert.doesNotMatch(combined, /Avocado|Pandan|RM135|RM120/);

assert.match(loadingShellSrc, /bg-paper mx-auto min-h-screen max-w-5xl px-5 py-10/);
assert.match(
  loadingShellSrc,
  /lg:grid-cols-\[minmax\(0,1fr\)_20\.5rem\]/,
);
assert.match(loadingShellSrc, /Your Order/);
assert.match(loadingShellSrc, /Opening order/);
assert.match(loadingShellSrc, /aria-busy/);
assert.match(loadingShellSrc, /min-h-12/);
assert.match(loadingShellSrc, /Collection Date/);

assert.match(readSrc(checkoutPage), /GuestCheckoutForm/);
assert.doesNotMatch(readSrc(checkoutPage), /StorefrontCheckoutLoading/);
assert.match(readSrc(checkoutRoute), /StorefrontCheckoutPage/);
assert.doesNotMatch(readSrc(checkoutRoute), /StorefrontCheckoutLoading/);
assert.doesNotMatch(readSrc(extraCheckout), /StorefrontCheckoutLoading/);

assert.match(cartSrc, /preorderCheckoutHref/);
assert.match(cartSrc, /href=\{checkoutHref\}/);
assert.match(cartSrc, /View My Order/);

const viewMyOrderLink = cartSrc.slice(
  cartSrc.lastIndexOf("<Link", cartSrc.indexOf("View My Order\n            </Link>")),
  cartSrc.indexOf("View My Order\n            </Link>") + "View My Order\n            </Link>".length,
);
assert.match(viewMyOrderLink, /href=\{checkoutHref\}/);
assert.doesNotMatch(viewMyOrderLink, /onClick=\{onContinue\}/);
assert.doesNotMatch(viewMyOrderLink, /setOpen\(false\)/);
assert.doesNotMatch(viewMyOrderLink, /window\.location/);
assert.doesNotMatch(viewMyOrderLink, /router\.push/);
assert.doesNotMatch(viewMyOrderLink, /preventDefault/);

const changeDateLink = cartSrc.slice(
  cartSrc.lastIndexOf("<Link", cartSrc.indexOf("Change Collection Date")),
  cartSrc.indexOf("Change Collection Date") + "Change Collection Date".length + 20,
);
assert.match(changeDateLink, /href=\{checkoutHref\}/);
assert.doesNotMatch(changeDateLink, /onClick=\{onContinue\}/);

const continueLink = cartSrc.slice(
  cartSrc.lastIndexOf("<Link", cartSrc.indexOf("Continue Ordering")),
  cartSrc.indexOf("Continue Ordering") + "Continue Ordering".length + 20,
);
assert.match(continueLink, /href=\{continueHref\}/);
assert.match(continueLink, /onClick=\{onContinue\}/);

assert.match(readSrc(draftSrc), /export function preorderCheckoutHref/);
assert.match(readSrc(actionsSrc), /export async function submitGuestPreorderAction/);
assert.match(readSrc(summarySrc), /Checking availability for that date/);
assert.match(readSrc(formSrc), /checkoutDraftItemsInCatalogue/);

console.log("PASS storefront checkout loading shell");
