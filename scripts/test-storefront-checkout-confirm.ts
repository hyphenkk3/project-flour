/**
 * Phase 4 checkout confirmation review (static + snapshot builder).
 * Run: npx tsx scripts/test-storefront-checkout-confirm.ts
 *
 * Does not submit orders or mutate catalogues.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { customerPreorderCommercialTotal } from "@/engines/orders/customer-preorder-options";
import { buildCheckoutConfirmSnapshot } from "@/workspaces/storefront/checkout/CheckoutConfirmPrompt";
import {
  emptyPreorderFields,
  type PreorderDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";

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
assert.match(formSrc, /buildCheckoutConfirmSnapshot/);
assert.match(handleSubmitSrc, /setConfirmOpen\(true\)/);
assert.doesNotMatch(handleSubmitSrc, /formAction\(/);
assert.doesNotMatch(handleSubmitSrc, /submitGuestPreorderAction\(/);
assert.match(handleSubmitSrc, /unavailableMessage/);
assert.match(handleSubmitSrc, /items\.length === 0/);
assert.match(handleSubmitSrc, /!collectionDateEvaluation\.valid/);
assert.match(handleSubmitSrc, /isPickupOrdersClosed/);

assert.match(promptSrc, /Confirm Your Order/);
assert.match(promptSrc, /Would you like to confirm this order\?/);
assert.match(promptSrc, /Confirm Order/);
assert.match(promptSrc, /Go Back/);
assert.match(promptSrc, /Collection/);
assert.match(promptSrc, /Your Order/);
assert.match(promptSrc, /Customer/);
assert.match(promptSrc, /Fulfilment/);
assert.match(promptSrc, /formatRm\(line\.linePrice\)/);
assert.match(promptSrc, /formatRm\(snapshot\.total\)/);
assert.match(promptSrc, /customerPreorderCommercialTotal|unitPrice \* item\.quantity/);
assert.match(promptSrc, /snapshot\.notes \?/);
assert.match(formSrc, /open=\{confirmOpen\}/);
assert.match(formSrc, /onConfirm=\{confirmOrder\}/);
assert.match(formSrc, /onGoBack=\{goBackFromConfirm\}/);
assert.match(formSrc, /snapshot=\{confirmSnapshot\}/);
assert.match(formSrc, /customerPreorderCommercialTotal/);

assert.doesNotMatch(promptSrc, /window\.confirm/);
assert.doesNotMatch(formSrc, /window\.confirm/);
assert.doesNotMatch(promptSrc, /showModal/);
assert.doesNotMatch(promptSrc, /<dialog/);
assert.doesNotMatch(promptSrc, /Proceed to Payment/);
assert.doesNotMatch(promptSrc, /Review Order/);
assert.doesNotMatch(
  promptSrc.split("aria-hidden")[1]?.split('role="dialog"')[0] ?? "",
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
assert.match(promptSrc, /disabled=\{pending\}/);
assert.doesNotMatch(formSrc, /submitGuestPreorderAction\(/);
assert.match(formSrc, /useActionState\(\s*submitGuestPreorderAction/);

assert.doesNotMatch(formSrc, /Review Order/);
assert.doesNotMatch(pageSrc, /Review Order/);
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
assert.doesNotMatch(successSrc, /Proceed to Payment/);
assert.doesNotMatch(extraFormSrc, /CheckoutConfirmPrompt/);

const avocado: PreorderDraftItem = {
  cakeId: "cake-1",
  sizeId: "size-6",
  quantity: 2,
  cakeName: "Avocado",
  sizeLabel: '6"',
  unitPrice: 135,
};
const fields = emptyPreorderFields();
fields.customerName = "QA Confirm Test";
fields.phone = "0123456789";
fields.pickupDate = "2026-09-08";
fields.pickupTime = "15:00";
fields.fulfilmentMethod = "pickup";
fields.notes = "";
const paidAddon = {
  code: "birthday_card",
  name: "Birthday Card",
  unitPrice: 3,
  financialShorthand: "BC",
  sortOrder: 1,
};
const pickupTotal = customerPreorderCommercialTotal({
  items: [avocado],
  options: [paidAddon],
  selectedCodes: [],
});
const pickupSnapshot = buildCheckoutConfirmSnapshot({
  items: [avocado],
  total: pickupTotal,
  pickupDateLabel: "8 Sep 2026",
  fields,
  paidAddonOptions: [paidAddon],
});
assert.equal(pickupSnapshot.collectionDate, "8 Sep 2026");
assert.match(pickupSnapshot.collectionTime, /3:00/);
assert.equal(pickupSnapshot.customerName, "QA Confirm Test");
assert.equal(pickupSnapshot.customerPhone, "0123456789");
assert.equal(pickupSnapshot.fulfilmentLabel, "Pickup");
assert.deepEqual(pickupSnapshot.fulfilmentDetails, []);
assert.equal(pickupSnapshot.notes, "");
assert.equal(pickupSnapshot.lines.length, 1);
assert.equal(pickupSnapshot.lines[0]?.name, "Avocado");
assert.equal(pickupSnapshot.lines[0]?.sizeLabel, '6"');
assert.equal(pickupSnapshot.lines[0]?.quantity, 2);
assert.equal(pickupSnapshot.lines[0]?.linePrice, 270);
assert.equal(pickupSnapshot.total, 270);

fields.notes = "Please keep this note after Go Back.";
fields.fulfilmentMethod = "dine_in";
fields.dineInVenue = "whitebird";
fields.guestCount = "4";
fields.reservationTime = "12:00";
fields.paidAddonCodes = ["birthday_card"];
const dineTotal = customerPreorderCommercialTotal({
  items: [avocado],
  options: [paidAddon],
  selectedCodes: ["birthday_card"],
});
const dineSnapshot = buildCheckoutConfirmSnapshot({
  items: [avocado],
  total: dineTotal,
  pickupDateLabel: "8 Sep 2026",
  fields,
  paidAddonOptions: [paidAddon],
});
assert.equal(dineSnapshot.fulfilmentLabel, "Dine-in");
assert.equal(dineSnapshot.fulfilmentDetails.includes("Whitebird"), true);
assert.equal(dineSnapshot.fulfilmentDetails.some((line) => /4 guests/.test(line)), true);
assert.equal(dineSnapshot.notes, "Please keep this note after Go Back.");
assert.equal(dineSnapshot.lines.length, 2);
assert.equal(dineSnapshot.lines[1]?.name, "Birthday Card");
assert.equal(dineSnapshot.total, 273);

fields.notes = "   ";
const noNotes = buildCheckoutConfirmSnapshot({
  items: [avocado],
  total: dineTotal,
  pickupDateLabel: "8 Sep 2026",
  fields,
  paidAddonOptions: [paidAddon],
});
assert.equal(noNotes.notes, "");

console.log("PASS storefront checkout confirmation");
