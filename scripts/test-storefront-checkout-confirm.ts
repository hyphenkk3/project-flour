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
import {
  buildCheckoutConfirmSnapshot,
  buildExtraCheckoutConfirmSnapshot,
} from "@/workspaces/storefront/checkout/CheckoutConfirmPrompt";
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
const extraCheckoutSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const overlaySrc = readSrc("src/workspaces/storefront/StorefrontOverlay.tsx");

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
assert.match(handleSubmitSrc, /customerNameValidationError/);
assert.match(handleSubmitSrc, /setNameError\(nameErrorMessage\)/);
assert.match(handleSubmitSrc, /setConfirmOpen\(true\)/);

assert.match(promptSrc, /Confirm Your Order/);
assert.match(promptSrc, /Would you like to confirm this order\?/);
assert.match(promptSrc, /Confirm Order/);
assert.match(promptSrc, /Go Back/);
assert.match(promptSrc, /StorefrontOverlay/);
assert.match(promptSrc, /panelClassName=/);
assert.doesNotMatch(promptSrc, /fixed inset-x-0 bottom-0 z-\[60\]/);
assert.doesNotMatch(promptSrc, /pointer-events-none fixed inset-0 z-50/);
assert.doesNotMatch(promptSrc, /fixed inset-0 z-50 animate-storefront-fade/);
assert.match(
  overlaySrc,
  /bg-ink\/40 animate-storefront-fade pointer-events-none fixed inset-0 z-50/,
);
assert.match(overlaySrc, /fixed inset-x-0 bottom-0 z-\[60\]/);
assert.doesNotMatch(overlaySrc, /fixed inset-0 z-\[60\] flex/);
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
assert.doesNotMatch(overlaySrc, /onClick/);

assert.match(goBackSrc, /setConfirmOpen\(false\)/);
assert.doesNotMatch(goBackSrc, /formAction\(/);
assert.doesNotMatch(goBackSrc, /setFields/);
assert.doesNotMatch(goBackSrc, /setItems/);
assert.doesNotMatch(goBackSrc, /emptyPreorderFields/);
assert.doesNotMatch(goBackSrc, /writePreorderDraft/);
assert.doesNotMatch(goBackSrc, /redirect/);

assert.match(confirmOrderSrc, /formAction\(formData\)/);
assert.match(confirmOrderSrc, /if \(pending \|\| state\.orderId\) return/);
assert.doesNotMatch(handleSubmitSrc, /formAction\(/);
assert.equal(
  (formSrc.match(/formAction\(formData\)/g) ?? []).length,
  1,
  "Confirm Order is the only formAction submission path",
);
assert.match(promptSrc, /disabled=\{pending\}/);
assert.match(formSrc, /pending=\{pending \|\| Boolean\(state\.orderId\)\}/);
assert.doesNotMatch(formSrc, /submitGuestPreorderAction\(/);
assert.match(formSrc, /useActionState\(\s*submitGuestPreorderAction/);
assert.doesNotMatch(formSrc, /router\.refresh/);
assert.doesNotMatch(formSrc, /router\.replace/);
assert.doesNotMatch(formSrc, /router\.push/);
assert.match(
  formSrc,
  /window\.location\.assign\(`\/order\/success\?order=\$\{orderId\}`\)/,
);
assert.match(formSrc, /if \(!orderId \|\| state\.error\) return/);
assert.match(goBackSrc, /if \(pending \|\| state\.orderId\) return/);
assert.equal(
  (actionsSrc.match(/return \{ error: null, orderId \}/g) ?? []).length,
  1,
);
const errorEffectSrc = formSrc.slice(
  formSrc.indexOf("if (state.error) {"),
  formSrc.indexOf("}, [state.error]);"),
);
assert.doesNotMatch(errorEffectSrc, /location\.assign/);
assert.doesNotMatch(handleSubmitSrc, /location\.assign/);

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

assert.match(actionsSrc, /return \{ error: null, orderId \}/);
assert.doesNotMatch(
  actionsSrc,
  /redirect\(`\/order\/success\?order=\$\{orderId\}`\)/,
);
assert.doesNotMatch(actionsSrc, /from "next\/navigation"/);
assert.match(successRouteSrc, /StorefrontSuccessPage/);
assert.match(successSrc, /Order Received/);
assert.doesNotMatch(successSrc, /Proceed to Payment/);
assert.match(extraCheckoutSrc, /CheckoutConfirmPrompt/);
assert.match(extraCheckoutSrc, /buildExtraCheckoutConfirmSnapshot/);
assert.match(extraCheckoutSrc, /event\.preventDefault\(\)/);
assert.match(extraCheckoutSrc, /onSubmit=\{\(event\) => \{/);
assert.doesNotMatch(extraCheckoutSrc, /onClick=\{openConfirm\}/);
assert.doesNotMatch(extraCheckoutSrc, /type="button"/);
assert.match(extraCheckoutSrc, /reportValidity/);
assert.doesNotMatch(extraCheckoutSrc, /action=\{handleSubmit\}/);
assert.doesNotMatch(extraCheckoutSrc, /action=\{formAction\}/);
assert.match(extraCheckoutSrc, /setConfirmOpen\(true\)/);
assert.doesNotMatch(extraCheckoutSrc, /Review Order/);
assert.doesNotMatch(extraCheckoutSrc, /submit_guest_preorder/);
assert.match(extraCheckoutSrc, /submitGuestExtraOrderAction/);

const extraOpenConfirmSrc = extraCheckoutSrc.slice(
  extraCheckoutSrc.indexOf("function openConfirm"),
  extraCheckoutSrc.indexOf("function confirmOrder"),
);
const extraConfirmOrderSrc = extraCheckoutSrc.slice(
  extraCheckoutSrc.indexOf("function confirmOrder"),
  extraCheckoutSrc.indexOf("function goBackFromConfirm"),
);
const extraGoBackSrc = extraCheckoutSrc.slice(
  extraCheckoutSrc.indexOf("function goBackFromConfirm"),
  extraCheckoutSrc.indexOf("function toggleComplimentary"),
);
assert.match(extraOpenConfirmSrc, /setConfirmOpen\(true\)/);
assert.match(extraOpenConfirmSrc, /new FormData\(form\)/);
assert.doesNotMatch(extraOpenConfirmSrc, /formAction\(/);
assert.match(extraConfirmOrderSrc, /formAction\(formData\)/);
assert.match(extraConfirmOrderSrc, /if \(pending \|\| state\.orderId\) return/);
assert.doesNotMatch(extraGoBackSrc, /formAction\(/);
assert.match(extraGoBackSrc, /setConfirmOpen\(false\)/);
assert.match(extraGoBackSrc, /if \(pending \|\| state\.orderId\) return/);
assert.doesNotMatch(extraGoBackSrc, /setPickupDate/);
assert.doesNotMatch(extraGoBackSrc, /setPaidAddonCodes/);
assert.doesNotMatch(extraGoBackSrc, /setComplimentaryCodes/);
assert.equal(
  (extraCheckoutSrc.match(/formAction\(formData\)/g) ?? []).length,
  1,
  "Fresh Pick Confirm Order is the only formAction submission path",
);
assert.match(
  extraCheckoutSrc,
  /window\.location\.assign\(\s*`\/order\/success\?order=\$\{state\.orderId\}&flow=\$\{FRESH_PICKS_SUCCESS_FLOW\}`/,
);
assert.match(extraCheckoutSrc, /if \(!state.orderId\) return/);
assert.match(
  extraCheckoutSrc,
  /pending=\{pending \|\| Boolean\(state\.orderId\)\}/,
);
assert.doesNotMatch(extraCheckoutSrc, /router\.push/);
assert.doesNotMatch(extraCheckoutSrc, /router\.replace/);
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
assert.match(extraActionsSrc, /return \{ error: null, orderId \}/);
assert.doesNotMatch(extraActionsSrc, /from "next\/navigation"/);
assert.doesNotMatch(extraActionsSrc, /redirect\(/);

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

const extraSnapshot = buildExtraCheckoutConfirmSnapshot({
  cakeName: "Avocado Fresh Pick",
  sizeLabel: '6"',
  unitPrice: 88,
  pickupDate: "2026-09-08",
  pickupTime: "15:00",
  customerName: "QA Extra Confirm",
  customerPhone: "0123456789",
  notes: "Keep these Fresh Pick notes.",
  paidAddonOptions: [paidAddon],
  paidAddonCodes: ["birthday_card"],
  complimentaryOptions: [
    {
      typeId: "knife-1",
      code: "cake_knife",
      name: "Cake Knife",
      sortOrder: 1,
    },
  ],
  complimentaryCodes: ["cake_knife"],
  total: 91,
});
assert.equal(extraSnapshot.collectionDate, "8 Sep");
assert.match(extraSnapshot.collectionTime, /3:00/);
assert.equal(extraSnapshot.fulfilmentLabel, "Pickup");
assert.deepEqual(extraSnapshot.fulfilmentDetails, []);
assert.equal(extraSnapshot.customerName, "QA Extra Confirm");
assert.equal(extraSnapshot.notes, "Keep these Fresh Pick notes.");
assert.equal(extraSnapshot.lines.length, 3);
assert.equal(extraSnapshot.lines[0]?.name, "Avocado Fresh Pick");
assert.equal(extraSnapshot.lines[0]?.sizeLabel, '6"');
assert.equal(extraSnapshot.lines[0]?.quantity, 1);
assert.equal(extraSnapshot.lines[0]?.linePrice, 88);
assert.equal(extraSnapshot.lines[1]?.name, "Birthday Card");
assert.equal(extraSnapshot.lines[1]?.linePrice, 3);
assert.equal(extraSnapshot.lines[2]?.name, "Cake Knife");
assert.equal(extraSnapshot.lines[2]?.complimentary, true);
assert.equal(extraSnapshot.total, 91);
assert.match(promptSrc, /Complimentary/);

console.log("PASS storefront checkout confirmation");
