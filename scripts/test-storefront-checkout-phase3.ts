/**
 * Phase 3 premium checkout composition (static).
 * Run: npx tsx scripts/test-storefront-checkout-phase3.ts
 *
 * Does not submit orders or mutate catalogues.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  WAITING_LIST_NAME_HELP,
  WAITING_LIST_WHATSAPP_NOTE,
} from "@/engines/waiting-list/phone";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const formSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
const pageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
const routeSrc = readSrc("src/app/order/checkout/page.tsx");
const summarySrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);
const cartSrc = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");
const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraPageSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);

assert.equal(existsSync(resolve(process.cwd(), "src/app/order/checkout/page.tsx")), true);
assert.match(routeSrc, /StorefrontCheckoutPage/);
assert.match(pageSrc, /GuestCheckoutForm/);
assert.doesNotMatch(pageSrc, /PreorderInProgressBar/);
assert.doesNotMatch(pageSrc, /StorefrontCartShell/);
assert.doesNotMatch(formSrc, /PreorderInProgressBar/);

const orderFiles = existsSync(resolve(process.cwd(), "src/app/order"))
  ? readdirSync(resolve(process.cwd(), "src/app/order"), { recursive: true }).map(
      String,
    )
  : [];
assert.equal(
  orderFiles.some((name) => name.toLowerCase().includes("review")),
  false,
  "no Review Order route",
);
assert.equal(existsSync(resolve(process.cwd(), "src/app/order/review")), false);
assert.doesNotMatch(formSrc, /Review Order/);
assert.doesNotMatch(pageSrc, /Review Order/);
assert.doesNotMatch(summarySrc, /Review Order/);

assert.match(formSrc, /customerPreorderCommercialTotal/);
assert.match(formSrc, /total=\{total\}/);
assert.match(summarySrc, /formatRm\(total\)/);

assert.match(formSrc, /title="Collection Date"/);
assert.match(formSrc, /font-display text-ink text-4xl/);
assert.match(formSrc, /Change date/);
assert.match(formSrc, /evaluateCollectionDate/);
assert.match(formSrc, /!collectionDateEvaluation\.valid/);
assert.match(formSrc, /disabled=\{submitBlocked \|\| confirmOpen\}/);
assert.match(
  formSrc,
  /items\.length > 0 && collectionDateInvalid/,
);

assert.match(formSrc, /WAITING_LIST_NAME_HELP/);
assert.match(formSrc, /WAITING_LIST_WHATSAPP_NOTE/);
assert.equal(
  WAITING_LIST_NAME_HELP,
  "Nickname / English name and surname",
);
assert.equal(
  WAITING_LIST_WHATSAPP_NOTE,
  "Please ensure the WhatsApp number is correct as we will contact you regarding your order.",
);
assert.doesNotMatch(formSrc, /Mr \/ Ms \/ Mrs/);

assert.match(formSrc, /Submit Order/);
assert.doesNotMatch(formSrc, /Submit Preorder/);
assert.doesNotMatch(formSrc, /Proceed to Payment/);
assert.doesNotMatch(formSrc, /Pay Now/);
assert.doesNotMatch(formSrc, /Review & Pay/);
assert.doesNotMatch(pageSrc, /Proceed to Payment/);
assert.doesNotMatch(summarySrc, /Proceed to Payment/);
assert.match(formSrc, /CheckoutConfirmPrompt/);
assert.doesNotMatch(formSrc, /window\.confirm/);

assert.match(formSrc, /Continue Ordering/);
assert.match(formSrc, /href="\/browse"/);
assert.match(formSrc, /persistDraft\(items, fields\)/);
assert.doesNotMatch(formSrc, /emptyPreorderDraft/);
const continueSlice = formSrc.slice(
  formSrc.indexOf("Continue Ordering") - 280,
  formSrc.indexOf("Continue Ordering") + 40,
);
assert.doesNotMatch(continueSlice, /writePreorderDraft/);
assert.doesNotMatch(continueSlice, /localStorage\.removeItem/);

assert.match(formSrc, /submitGuestPreorderAction/);
assert.doesNotMatch(formSrc, /create_staff_guest_preorder/);
assert.match(
  formSrc,
  /lg:grid-cols-\[minmax\(0,1fr\)_20\.5rem\]/,
);
assert.match(formSrc, /CheckoutOrderSummary/);
assert.match(formSrc, /title="Customer Details"/);
assert.match(summarySrc, /Your Order/);
assert.match(summarySrc, /draftLinePreorderLabel/);

assert.doesNotMatch(extraFormSrc, /GuestCheckoutForm/);
assert.doesNotMatch(extraFormSrc, /CheckoutOrderSummary/);
assert.doesNotMatch(extraFormSrc, /CheckoutSection/);
assert.doesNotMatch(extraPageSrc, /StorefrontCheckoutPage/);
assert.doesNotMatch(extraPageSrc, /PreorderInProgressBar/);
assert.doesNotMatch(extraFormSrc, /WAITING_LIST_WHATSAPP_NOTE/);

assert.match(cartSrc, /md:fixed md:inset-y-0 md:right-0/);
assert.match(cartSrc, /setDraftLineSize/);
assert.match(cartSrc, /View My Order/);
assert.doesNotMatch(cartSrc, /GuestCheckoutForm/);
assert.doesNotMatch(cartSrc, /CheckoutOrderSummary/);

const pickupSrc = readSrc("src/components/ui/PickupSlotFields.tsx");
assert.match(pickupSrc, /type="date"/);
assert.doesNotMatch(formSrc, /custom calendar/);

console.log("PASS storefront checkout phase 3");
