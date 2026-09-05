/**
 * Phase 4a lightweight checkout confirmation (static).
 * Run: npx tsx scripts/test-storefront-checkout-confirm.ts
 *
 * Does not submit orders or mutate catalogues.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const formSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
const promptSrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutConfirmPrompt.tsx",
);
const pageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
const successRouteSrc = readSrc("src/app/order/success/page.tsx");
const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);

const handleSubmitSrc = formSrc.slice(
  formSrc.indexOf("function handleSubmit"),
  formSrc.indexOf("function confirmOrder"),
);
const confirmOrderSrc = formSrc.slice(
  formSrc.indexOf("function confirmOrder"),
  formSrc.indexOf("function goBackFromConfirm"),
);
const goBackSrc = formSrc.slice(
  formSrc.indexOf("function goBackFromConfirm"),
  formSrc.indexOf("const upcomingClosed"),
);

assert.match(formSrc, /CheckoutConfirmPrompt/);
assert.match(handleSubmitSrc, /setConfirmOpen\(true\)/);
assert.doesNotMatch(handleSubmitSrc, /formAction\(/);
assert.doesNotMatch(handleSubmitSrc, /submitGuestPreorderAction\(/);

assert.match(handleSubmitSrc, /unavailableMessage/);
assert.match(handleSubmitSrc, /items\.length === 0/);
assert.match(handleSubmitSrc, /!collectionDateEvaluation\.valid/);
assert.match(handleSubmitSrc, /isPickupOrdersClosed/);
assert.match(
  handleSubmitSrc,
  /setConfirmOpen\(true\)/,
);

assert.match(promptSrc, /Would you like to confirm this order\?/);
assert.match(promptSrc, /Confirm Order/);
assert.match(promptSrc, /Go Back/);
assert.match(formSrc, /open=\{confirmOpen\}/);
assert.match(formSrc, /onConfirm=\{confirmOrder\}/);
assert.match(formSrc, /onGoBack=\{goBackFromConfirm\}/);

assert.doesNotMatch(promptSrc, /window\.confirm/);
assert.doesNotMatch(formSrc, /window\.confirm/);
assert.doesNotMatch(promptSrc, /showModal/);
assert.doesNotMatch(promptSrc, /<dialog/);
assert.doesNotMatch(promptSrc, /onClick=\{onGoBack\}[\s\S]*absolute inset-0/);
assert.match(promptSrc, /aria-hidden className="bg-ink\/40 absolute inset-0"/);
assert.doesNotMatch(
  promptSrc.split("aria-hidden")[1]?.split("role=\"dialog\"")[0] ?? "",
  /onClick/,
);

assert.match(goBackSrc, /setConfirmOpen\(false\)/);
assert.doesNotMatch(goBackSrc, /formAction\(/);
assert.doesNotMatch(goBackSrc, /setFields/);
assert.doesNotMatch(goBackSrc, /setItems/);
assert.doesNotMatch(goBackSrc, /emptyPreorderFields/);
assert.doesNotMatch(goBackSrc, /writePreorderDraft/);
assert.doesNotMatch(goBackSrc, /redirect/);

assert.match(confirmOrderSrc, /formAction\(formData\)/);
assert.match(confirmOrderSrc, /if \(pending\) return/);
assert.doesNotMatch(formSrc, /submitGuestPreorderAction\(/);
assert.match(formSrc, /useActionState\(\s*submitGuestPreorderAction/);

assert.doesNotMatch(formSrc, /Review Order/);
assert.doesNotMatch(pageSrc, /Review Order/);
assert.doesNotMatch(promptSrc, /Review Order/);
assert.equal(existsSync(resolve(process.cwd(), "src/app/order/review")), false);
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

assert.match(actionsSrc, /redirect\(`\/order\/success\?order=\$\{orderId\}`\)/);
assert.match(successRouteSrc, /StorefrontSuccessPage/);
assert.match(successSrc, /Order Received/);
assert.match(successSrc, /Payment Pending/);
assert.match(successSrc, /Whitebird will contact you via WhatsApp\./);
assert.doesNotMatch(successSrc, /Proceed to Payment/);
assert.doesNotMatch(formSrc, /Proceed to Payment/);
assert.doesNotMatch(successSrc, /customer edit/);

assert.doesNotMatch(extraFormSrc, /CheckoutConfirmPrompt/);
assert.doesNotMatch(extraFormSrc, /Would you like to confirm this order\?/);

console.log("PASS storefront checkout confirmation");
