/**
 * Checkout must not replace a rendered form with the route loading shell
 * during local interactions or confirm/submit.
 * Run: npx tsx scripts/test-storefront-checkout-interaction-lag.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const routeSrc = readSrc("src/app/order/checkout/page.tsx");
const pageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const promptSrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutConfirmPrompt.tsx",
);
const loadingSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutLoading.tsx",
);
const loadingRouteSrc = readSrc("src/app/order/checkout/loading.tsx");
const summarySrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);
const ackSrc = readSrc("src/engines/orders/cake-size-price-ack.ts");
const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");

const handleSubmitSrc = formSrc.slice(
  formSrc.indexOf("function handleSubmit"),
  formSrc.indexOf("function confirmOrder"),
);
const confirmOrderSrc = formSrc.slice(
  formSrc.indexOf("function confirmOrder"),
  formSrc.indexOf("function goBackFromConfirm"),
);
const ackToggleSrc = formSrc.slice(
  formSrc.indexOf("name=\"price_ack_accepted\""),
  formSrc.indexOf("name=\"price_ack_accepted\"") + 500,
);

assert.doesNotMatch(routeSrc, /await searchParams/);
assert.doesNotMatch(routeSrc, /async function OrderCheckoutPage/);
assert.match(routeSrc, /export default function OrderCheckoutPage/);
assert.match(routeSrc, /<StorefrontCheckoutPage/);
assert.match(pageSrc, /useSearchParams/);
assert.match(pageSrc, /["']use client["']/);
assert.match(pageSrc, /resolveCheckoutPickupScope/);
assert.match(pageSrc, /GuestCheckoutForm/);
assert.doesNotMatch(pageSrc, /StorefrontCheckoutLoading/);
assert.doesNotMatch(pageSrc, /Opening order/);

assert.doesNotMatch(formSrc, /StorefrontCheckoutLoading/);
assert.doesNotMatch(formSrc, /Opening order/);
assert.doesNotMatch(promptSrc, /StorefrontCheckoutLoading/);
assert.doesNotMatch(formSrc, /router\.refresh/);
assert.doesNotMatch(formSrc, /router\.push/);
assert.doesNotMatch(handleSubmitSrc, /router\.replace/);

assert.match(handleSubmitSrc, /setConfirmOpen\(true\)/);
assert.doesNotMatch(handleSubmitSrc, /formAction\(/);
assert.doesNotMatch(handleSubmitSrc, /submitGuestPreorderAction\(/);
assert.doesNotMatch(handleSubmitSrc, /loadCheckoutPickupOffer/);
assert.doesNotMatch(handleSubmitSrc, /resolveCheckoutCakeSizePrices/);

assert.match(confirmOrderSrc, /submitGuestOrderAndNavigate/);
assert.doesNotMatch(confirmOrderSrc, /setHydrated\(false\)/);
assert.doesNotMatch(confirmOrderSrc, /StorefrontCheckoutLoading/);

assert.match(ackToggleSrc, /setAcknowledgedSnapshot/);
assert.doesNotMatch(ackToggleSrc, /formAction\(/);
assert.doesNotMatch(ackToggleSrc, /loadCheckoutPickupOffer/);
assert.doesNotMatch(ackToggleSrc, /resolveCheckoutCakeSizePrices/);

assert.match(formSrc, /loadCheckoutDateConfirmation\(/);
assert.match(formSrc, /resolveCheckoutCakeSizePrices\(pickupDate, sizeIds\)/);
assert.match(formSrc, /liveOfferPending/);
assert.match(formSrc, /Price updated for your selected pickup date/);
assert.match(formSrc, /resolveCheckoutCakeSizePrices/);
assert.match(summarySrc, /Checking availability for that date/);
assert.match(ackSrc, /quotedDraftItemUnitPrice/);
assert.match(actionsSrc, /p_price_ack/);
assert.match(actionsSrc, /library_cake_size_price_on/);

assert.match(loadingSrc, /Opening order/);
assert.match(loadingRouteSrc, /StorefrontCheckoutLoading/);
assert.doesNotMatch(loadingSrc, /submitGuestPreorderAction/);

console.log("PASS storefront checkout interaction lag");
