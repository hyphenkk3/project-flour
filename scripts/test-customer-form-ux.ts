/**
 * Customer-facing form UX standard: required markers, field errors, first-error focus.
 * Run: npx tsx scripts/test-customer-form-ux.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CUSTOMER_NAME_HELP,
  CUSTOMER_NAME_SPACE_HINT,
} from "@/engines/orders/customer-name";
import { WAITING_LIST_WHATSAPP_NOTE } from "@/engines/waiting-list/phone";
import {
  CUSTOMER_FORM_HIGHLIGHT_SUMMARY,
  customerFieldValidityMessage,
  humanValidityMessage,
} from "@/components/ui/form/customer-form-ux";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const controls = readSrc("src/components/ui/form/FormControls.tsx");
const helper = readSrc("src/components/ui/form/customer-form-ux.ts");
const pickup = readSrc("src/components/ui/PickupSlotFields.tsx");
const dineIn = readSrc("src/components/ui/DineInVenuePartyFields.tsx");
const chooser = readSrc(
  "src/workspaces/storefront/checkout/FulfilmentMethodChooser.tsx",
);
const checkout = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const extraCheckout = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const extraOrder = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const joinWaiting = readSrc(
  "src/workspaces/storefront/waiting-list/JoinWaitingListForm.tsx",
);
const waitingConfirm = readSrc(
  "src/workspaces/storefront/waiting-list/WaitingListConfirmationForm.tsx",
);
const staffAssisted = readSrc(
  "src/workspaces/customer-operations/orders/AssistedOrderFulfilmentFields.tsx",
);
const staffOwner = readSrc(
  "src/workspaces/owner/orders/OrderWorkspaceForm.tsx",
);

assert.match(controls, /export function RequiredAsterisk/);
assert.match(controls, /export function FormRequiredLegend/);
assert.match(controls, /Required fields/);
assert.match(controls, /required \? <RequiredAsterisk/);
assert.match(controls, /error \? \(/);
assert.match(controls, /aria-invalid/);
assert.match(controls, /aria-describedby/);
assert.match(controls, /role="alert"/);
assert.match(helper, /focusFirstInvalidField/);
assert.match(helper, /collectInvalidFieldMessages/);
assert.match(helper, /scrollIntoView/);
assert.match(helper, /data-field-label/);
assert.match(controls, /data-field-label/);
assert.match(controls, /data-field-help/);

assert.equal(
  CUSTOMER_FORM_HIGHLIGHT_SUMMARY,
  "Please complete the highlighted fields before continuing.",
);
assert.equal(
  CUSTOMER_NAME_HELP,
  "English / preferred name and surname.",
);
assert.equal(
  CUSTOMER_NAME_SPACE_HINT,
  "Please leave a space between names.",
);
assert.doesNotMatch(CUSTOMER_NAME_HELP, /\.\./);
assert.doesNotMatch(`${CUSTOMER_NAME_HELP} ${CUSTOMER_NAME_SPACE_HINT}`, /names\.Please/);
assert.equal(
  humanValidityMessage({ valueMissing: true, typeMismatch: false, patternMismatch: false }, "Name", "enter"),
  "Please enter your name.",
);
assert.equal(
  humanValidityMessage({ valueMissing: true, typeMismatch: false, patternMismatch: false }, "WhatsApp phone", "enter"),
  "Please enter your WhatsApp number.",
);
assert.equal(
  humanValidityMessage({ valueMissing: true, typeMismatch: false, patternMismatch: false }, "Venue", "select"),
  "Please select a venue.",
);
assert.equal(
  humanValidityMessage({ valueMissing: true, typeMismatch: false, patternMismatch: false }, "Adults", "enter"),
  "Please enter the number of adults.",
);
assert.equal(
  humanValidityMessage({ valueMissing: false, typeMismatch: true, patternMismatch: false }, "Email", "enter"),
  "Please enter a valid email address.",
);

const nameError = customerFieldValidityMessage({
  name: "customer_name",
  label: `Name ${CUSTOMER_NAME_HELP} ${CUSTOMER_NAME_SPACE_HINT}`,
  kind: "enter",
  validity: { valueMissing: true, typeMismatch: false, patternMismatch: false },
});
assert.equal(nameError, "Please enter your name.");
assert.doesNotMatch(nameError, /preferred name/i);
assert.doesNotMatch(nameError, /leave a space/i);
assert.doesNotMatch(nameError, /names\./i);

const whatsappError = customerFieldValidityMessage({
  name: "phone",
  label: `WhatsApp phone ${WAITING_LIST_WHATSAPP_NOTE}`,
  kind: "enter",
  validity: { valueMissing: true, typeMismatch: false, patternMismatch: false },
});
assert.equal(whatsappError, "Please enter your WhatsApp number.");
assert.doesNotMatch(whatsappError, /ensure the WhatsApp number/i);
assert.doesNotMatch(whatsappError, /regarding your order/i);
assert.match(whatsappError, /WhatsApp/);
assert.doesNotMatch(whatsappError, /whatsapp/);

const deliveryError = customerFieldValidityMessage({
  name: "address_line_1",
  label: "Address line 1 Optional delivery notes.",
  kind: "enter",
  validity: { valueMissing: true, typeMismatch: false, patternMismatch: false },
});
assert.equal(deliveryError, "Please enter address line 1.");
assert.doesNotMatch(deliveryError, /Optional/);

assert.doesNotMatch(helper, /Something went wrong/);
assert.doesNotMatch(helper, /Validation failed/);
assert.doesNotMatch(helper, /Invalid input/);

assert.match(pickup, /markRequired\?: boolean/);
assert.match(pickup, /markRequired = false/);
assert.match(pickup, /required=\{markRequired && required\}/);
assert.match(dineIn, /markRequired\?: boolean/);
assert.match(dineIn, /markRequired = false/);
assert.match(dineIn, /required=\{markRequired\}/);
assert.match(chooser, /RequiredAsterisk/);

assert.match(checkout, /FormRequiredLegend/);
assert.match(checkout, /label="Name"[\s\S]*required/);
assert.match(checkout, /label="WhatsApp phone"[\s\S]*required/);
assert.match(checkout, /label="Address line 1"[\s\S]*required/);
assert.match(checkout, /label="Address line 2"/);
assert.doesNotMatch(
  checkout,
  /label="Address line 2"[\s\S]{0,80}required/,
);
assert.match(checkout, /label="Reservation note"/);
assert.doesNotMatch(
  checkout,
  /label="Reservation note"[\s\S]{0,80}required/,
);
assert.match(checkout, /markRequired/);
assert.match(checkout, /collectInvalidFieldMessages/);
assert.match(checkout, /focusFirstInvalidField/);
assert.match(checkout, /noValidate/);
assert.match(checkout, /CUSTOMER_FORM_HIGHLIGHT_SUMMARY/);
assert.match(checkout, /This collection date is no longer available|customerCollectionDateMessage|unavailableMessage/);
assert.match(checkout, /fulfilmentMethod === "delivery"/);

assert.match(extraCheckout, /FormRequiredLegend/);
assert.match(extraCheckout, /RequiredAsterisk/);
assert.match(extraCheckout, /collectInvalidFieldMessages/);
assert.match(extraCheckout, /focusFirstInvalidField/);
assert.match(extraCheckout, /noValidate/);
assert.match(extraCheckout, /markRequired/);
assert.doesNotMatch(extraCheckout, /reportValidity/);

assert.match(extraOrder, /FormRequiredLegend/);
assert.match(extraOrder, /RequiredAsterisk/);
assert.match(extraOrder, /collectInvalidFieldMessages/);
assert.match(extraOrder, /focusFirstInvalidField/);
assert.doesNotMatch(extraOrder, /<FormField[\s\S]*htmlFor="pickup_date"/);
assert.doesNotMatch(extraOrder, /<FormField[\s\S]*htmlFor="pickup_time"/);

assert.match(joinWaiting, /FormRequiredLegend/);
assert.match(joinWaiting, /label="Name"[\s\S]*required/);
assert.match(joinWaiting, /label="WhatsApp phone"[\s\S]*required/);
assert.match(joinWaiting, /focusFirstInvalidField/);

assert.match(waitingConfirm, /FormRequiredLegend/);
assert.match(waitingConfirm, /markRequired/);
assert.match(waitingConfirm, /label="Name"[\s\S]*required/);
assert.match(waitingConfirm, /label="Address line 2"/);
assert.doesNotMatch(
  waitingConfirm,
  /label="Address line 2"[\s\S]{0,80}required/,
);
assert.match(waitingConfirm, /focusFirstInvalidField/);

assert.doesNotMatch(staffAssisted, /markRequired/);
assert.doesNotMatch(staffOwner, /markRequired/);
assert.match(staffAssisted, /requireAcknowledgement=\{false\}/);

assert.match(checkout, /customerPaidAddonMessageRequired/);
assert.match(checkout, /required=\{messageRequired\}/);
assert.match(checkout, /help=\{messageRequired \? undefined : "Optional\."\}/);

console.log("test-customer-form-ux: ok");
