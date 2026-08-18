/**
 * Extra Preorder physical receipt + complimentary selection.
 * Run: npx tsx scripts/test-guest-extra-receipt-complimentary.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  customerComplimentaryMutationPayload,
  formatCustomerPreorderOptionLabel,
  type CustomerComplimentaryOption,
} from "@/engines/orders/customer-preorder-options";
import {
  buildConfirmationPayload,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const complimentaryOptions: CustomerComplimentaryOption[] = [
  {
    typeId: "type-topper",
    code: "birthday_topper",
    name: "Birthday Topper",
    sortOrder: 0,
  },
  { typeId: "type-candle", code: "candle", name: "Candle", sortOrder: 1 },
  { typeId: "type-knife", code: "knife", name: "Knife", sortOrder: 2 },
];

assert.equal(parseRequiredPhysicalReceipt(""), null, "unset receipt rejected");
assert.equal(parseRequiredPhysicalReceipt("yes"), true);
assert.equal(parseRequiredPhysicalReceipt("no"), false);
assert.equal(parseRequiredPhysicalReceipt("on"), null);

const none = customerComplimentaryMutationPayload({
  options: complimentaryOptions,
  selectedCodes: [],
});
assert.deepEqual(none, []);

const topper = customerComplimentaryMutationPayload({
  options: complimentaryOptions,
  selectedCodes: ["birthday_topper"],
});
assert.equal(topper.length, 1);
assert.equal(topper[0]?.code, "birthday_topper");
assert.equal(topper[0]?.quantity, 1);

const candle = customerComplimentaryMutationPayload({
  options: complimentaryOptions,
  selectedCodes: ["candle"],
});
assert.equal(candle[0]?.code, "candle");

const knife = customerComplimentaryMutationPayload({
  options: complimentaryOptions,
  selectedCodes: ["knife"],
});
assert.equal(knife[0]?.code, "knife");

const multiple = customerComplimentaryMutationPayload({
  options: complimentaryOptions,
  selectedCodes: ["birthday_topper", "candle", "knife"],
});
assert.equal(multiple.length, 3);
assert.deepEqual(
  multiple.map((row) => row.code),
  ["birthday_topper", "candle", "knife"],
);

assert.equal(
  formatCustomerPreorderOptionLabel("Birthday Topper", 0),
  "Birthday Topper — RM0",
);
assert.equal(formatCustomerPreorderOptionLabel("Candle", 0), "Candle — RM0");
assert.equal(formatCustomerPreorderOptionLabel("Knife", 0), "Knife — RM0");

const extraCakes = [
  {
    cakeName: "Extra Pistachio",
    sizeLabel: '6"',
    quantity: 1,
    unitPrice: 135,
  },
];

function extraConfirm(input: {
  includeReceipt: boolean;
  complimentaryCodes: string[];
}): string {
  const complimentaryItems = customerComplimentaryMutationPayload({
    options: complimentaryOptions,
    selectedCodes: input.complimentaryCodes,
  }).map((row) => ({ name: row.name, quantity: row.quantity }));
  return generateConfirmationMessage(
    buildConfirmationPayload({
      staffCustomerFacingName: "Amy",
      customerName: "Extra Guest",
      customerPhone: "0190000185",
      pickupDate: "2026-08-18",
      pickupTime: "15:00",
      items: extraCakes,
      complimentaryItems,
      paidAddons: [],
      subtotal: 135,
      adjustments: [],
      amountDue: 135,
      includeReceipt: input.includeReceipt,
    }),
  );
}

const receiptYes = extraConfirm({
  includeReceipt: true,
  complimentaryCodes: [],
});
assert.match(receiptYes, /\*Include RECEIPT/);
assert.doesNotMatch(receiptYes, /\*Complimentary/);
assert.match(receiptYes, /RM135/);

const receiptNo = extraConfirm({
  includeReceipt: false,
  complimentaryCodes: [],
});
assert.doesNotMatch(receiptNo, /\*Include RECEIPT/);
assert.doesNotMatch(receiptNo, /\*Complimentary/);

const emailYesPhysicalNo = extraConfirm({
  includeReceipt: false,
  complimentaryCodes: [],
});
assert.doesNotMatch(emailYesPhysicalNo, /\*Include RECEIPT/);
assert.doesNotMatch(emailYesPhysicalNo, /email/i);

const emailNoPhysicalYes = extraConfirm({
  includeReceipt: true,
  complimentaryCodes: [],
});
assert.match(emailNoPhysicalYes, /\*Include RECEIPT/);

const bothYes = extraConfirm({
  includeReceipt: true,
  complimentaryCodes: ["birthday_topper"],
});
assert.match(bothYes, /\*Include RECEIPT/);
assert.match(bothYes, /\*Complimentary Birthday Topper x1/);
assert.match(bothYes, /RM135/);
assert.doesNotMatch(bothYes, /RM135\+RM/);

const topperConfirm = extraConfirm({
  includeReceipt: false,
  complimentaryCodes: ["birthday_topper"],
});
assert.match(topperConfirm, /\*Complimentary Birthday Topper x1/);
assert.doesNotMatch(topperConfirm, /\*Include RECEIPT/);

const candleConfirm = extraConfirm({
  includeReceipt: false,
  complimentaryCodes: ["candle"],
});
assert.match(candleConfirm, /\*Complimentary Candle x1/);

const knifeConfirm = extraConfirm({
  includeReceipt: false,
  complimentaryCodes: ["knife"],
});
assert.match(knifeConfirm, /\*Complimentary Knife x1/);

const multiConfirm = extraConfirm({
  includeReceipt: true,
  complimentaryCodes: ["birthday_topper", "candle", "knife"],
});
assert.match(
  multiConfirm,
  /\*Complimentary Birthday Topper x1, Candle x1, Knife x1\n\*Include RECEIPT/,
);
assert.match(multiConfirm, /RM135/);
assert.doesNotMatch(multiConfirm, /\+RM0/);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
assert.match(extraFormSrc, /Would you like a copy of the receipt\? \(will be attached during pickup\)/);
assert.match(extraFormSrc, /name="include_receipt"/);
assert.match(extraFormSrc, /email_submission_receipt_requested/);
assert.match(extraFormSrc, /name="complimentary_code"/);
assert.match(extraFormSrc, /formatCustomerPreorderOptionLabel\(option\.name, 0\)/);
assert.match(extraFormSrc, /formatRm\(extra\.unitPrice\)/);
assert.doesNotMatch(extraFormSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraFormSrc, /GuestCheckoutForm/);
assert.doesNotMatch(extraFormSrc, /paidAddon/);
assert.doesNotMatch(extraFormSrc, /birthday_card/);

const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
assert.match(extraActionsSrc, /submit_guest_extra_order/);
assert.match(extraActionsSrc, /p_include_receipt/);
assert.match(extraActionsSrc, /p_complimentary/);
assert.match(
  extraActionsSrc,
  /Please choose whether you would like a copy of the receipt/,
);
assert.match(extraActionsSrc, /storefront_customer_preorder_options/);
assert.doesNotMatch(extraActionsSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraActionsSrc, /p_paid_addons/);

const cakeFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(cakeFormSrc, /name="include_receipt"/);
assert.match(cakeFormSrc, /paidAddonOptions/);
assert.match(cakeFormSrc, /complimentaryOptions/);
assert.match(cakeFormSrc, /submitGuestPreorderAction/);

const cakeActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
assert.match(cakeActionsSrc, /submit_guest_preorder/);
assert.match(cakeActionsSrc, /p_include_receipt/);
assert.match(cakeActionsSrc, /p_paid_addons/);
assert.doesNotMatch(cakeActionsSrc, /submit_guest_extra_order/);

const migrationSrc = readSrc(
  "supabase/migrations/20260818150000_guest_extra_include_receipt_complimentary.sql",
);
assert.match(migrationSrc, /p_include_receipt boolean default false/);
assert.match(migrationSrc, /p_complimentary jsonb default '\[\]'::jsonb/);
assert.match(migrationSrc, /include_receipt/);
assert.match(migrationSrc, /order_complimentary_items/);
assert.match(migrationSrc, /collection_id,\s*\n\s*extra_stock_id/);
assert.match(migrationSrc, /null,\s*\n\s*p_extra_stock_id/);
assert.doesNotMatch(migrationSrc, /submit_guest_preorder/);
assert.doesNotMatch(migrationSrc, /p_paid_addons/);
assert.doesNotMatch(migrationSrc, /alter table public\.orders add/i);

console.log("PASS extra preorder receipt / complimentary");
