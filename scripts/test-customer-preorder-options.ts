/**
 * Customer Whole Cake preorder options — pricing, mapping, confirmation payload.
 * Run: npx tsx scripts/test-customer-preorder-options.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  customerComplimentaryMutationPayload,
  customerPaidAddonMessageRequired,
  customerPaidAddonMessageVisible,
  customerPaidAddonMutationPayload,
  customerPreorderCommercialTotal,
  formatCustomerPreorderOptionLabel,
  type CustomerComplimentaryOption,
  type CustomerPaidAddonOption,
  type CustomerPreorderSelections,
} from "@/engines/orders/customer-preorder-options";
import {
  buildConfirmationPayload,
  formatComplimentaryLine,
  generateConfirmationMessage,
} from "@/engines/orders/confirmation-message";
import { paidAddonDraftsToMutationPayload } from "@/engines/orders/paid-addons";
import { parseRequiredPhysicalReceipt } from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const cakes = [
  {
    cakeName: "Pistachio Chocolate (Less Sweet)",
    sizeLabel: '6"',
    quantity: 1,
    unitPrice: 135,
  },
];

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

const paidOptions: CustomerPaidAddonOption[] = [
  {
    code: "birthday_card",
    name: "Birthday Card",
    unitPrice: 3,
    financialShorthand: "BC",
    sortOrder: 0,
  },
  {
    code: "wishing_card",
    name: "Wishing Card",
    unitPrice: 3,
    financialShorthand: "WC",
    sortOrder: 1,
  },
];

function selections(
  patch: Partial<CustomerPreorderSelections> = {},
): CustomerPreorderSelections {
  return {
    complimentaryCodes: [],
    paidAddonCodes: [],
    birthdayCardMessage: "",
    wishingCardMessage: "",
    ...patch,
  };
}

function totalFor(paidAddonCodes: string[]): number {
  return customerPreorderCommercialTotal({
    items: cakes,
    options: paidOptions,
    selectedCodes: paidAddonCodes,
  });
}

assert.equal(totalFor([]), 135, "1. no cards — cake price unchanged");
assert.equal(totalFor(["birthday_card"]), 138, "2. Birthday Card x1 = +RM3");
assert.equal(totalFor(["wishing_card"]), 138, "3. Wishing Card x1 = +RM3");
assert.equal(
  totalFor(["birthday_card", "wishing_card"]),
  141,
  "4. both cards = +RM6",
);

for (const code of ["birthday_topper", "candle", "knife"] as const) {
  const payload = customerComplimentaryMutationPayload({
    options: complimentaryOptions,
    selectedCodes: [code],
  });
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.quantity, 1);
  assert.equal(totalFor([]), 135, `${code} is RM0`);
}

assert.equal(
  customerComplimentaryMutationPayload({
    options: complimentaryOptions,
    selectedCodes: ["birthday_topper", "candle", "knife"],
  }).length,
  3,
  "8. all complimentary selected",
);
assert.equal(totalFor([]), 135, "8. all complimentary still +RM0");

assert.equal(
  formatCustomerPreorderOptionLabel("Birthday Topper", 0),
  "Birthday Topper — RM0",
);
assert.equal(
  formatCustomerPreorderOptionLabel("Birthday Card", 3),
  "Birthday Card — RM3",
);
assert.equal(
  formatCustomerPreorderOptionLabel("Wishing Card", 3),
  "Wishing Card — RM3",
);

const nonePayload = customerPaidAddonMutationPayload({
  options: paidOptions,
  selections: selections({
    birthdayCardMessage: "should not persist",
    wishingCardMessage: "should not persist",
  }),
});
assert.deepEqual(nonePayload, []);
assert.equal(
  customerPaidAddonMessageRequired("birthday_card", []),
  false,
);
assert.equal(
  customerPaidAddonMessageVisible("birthday_card", []),
  false,
  "12. Birthday Card not selected → message hidden / not required",
);
assert.equal(
  customerPaidAddonMessageVisible("wishing_card", ["birthday_card"]),
  false,
);
assert.equal(
  customerPaidAddonMessageVisible("birthday_card", ["birthday_card"]),
  true,
);
assert.equal(
  customerPaidAddonMessageRequired("birthday_card", ["birthday_card"]),
  false,
);

const birthdayPayload = customerPaidAddonMutationPayload({
  options: paidOptions,
  selections: selections({
    paidAddonCodes: ["birthday_card"],
    birthdayCardMessage: "Happy birthday Mummy! Love Eby, Tun, Papa",
  }),
});
assert.equal(birthdayPayload.length, 1);
assert.equal(birthdayPayload[0]?.code, "birthday_card");
assert.equal(birthdayPayload[0]?.quantity, 1);
assert.deepEqual(birthdayPayload[0]?.messages, [
  "Happy birthday Mummy! Love Eby, Tun, Papa",
]);
assert.equal(
  JSON.stringify(birthdayPayload),
  JSON.stringify(
    paidAddonDraftsToMutationPayload([
      {
        code: "birthday_card",
        name: "Birthday Card",
        catalogUnitPrice: 3,
        snapshotUnitPrice: 3,
        selected: true,
        quantity: 1,
        maxQuantity: 1,
        writtenMessages: ["Happy birthday Mummy! Love Eby, Tun, Papa"],
        sortOrder: 0,
      },
    ]),
  ),
  "reuse canonical paid-addon mutation helper",
);

const wishingPayload = customerPaidAddonMutationPayload({
  options: paidOptions,
  selections: selections({
    paidAddonCodes: ["wishing_card"],
    wishingCardMessage: "Wish you a wonderful year",
  }),
});
assert.equal(wishingPayload[0]?.code, "wishing_card");
assert.deepEqual(wishingPayload[0]?.messages, ["Wish you a wonderful year"]);

const bothPayload = customerPaidAddonMutationPayload({
  options: paidOptions,
  selections: selections({
    paidAddonCodes: ["birthday_card", "wishing_card"],
    birthdayCardMessage: "Happy birthday Mummy! Love Eby, Tun, Papa",
    wishingCardMessage: "Wish you a wonderful year",
  }),
});
assert.equal(bothPayload.length, 2);
assert.deepEqual(
  bothPayload.map((row) => row.code).sort(),
  ["birthday_card", "wishing_card"],
);

function confirmFromSelections(
  next: CustomerPreorderSelections,
  includeReceipt = false,
): string {
  const paidMutation = customerPaidAddonMutationPayload({
    options: paidOptions,
    selections: next,
  });
  const paidAddons = paidMutation.map((row) => {
    const option = paidOptions.find((entry) => entry.code === row.code)!;
    return {
      name: option.name,
      quantity: row.quantity,
      unitPrice: option.unitPrice,
      financialShorthand: option.financialShorthand,
      writtenMessage: row.messages[0] ?? null,
      messages: row.messages.map((writtenMessage, index) => ({
        cardIndex: index + 1,
        writtenMessage,
      })),
    };
  });
  const complimentaryItems = customerComplimentaryMutationPayload({
    options: complimentaryOptions,
    selectedCodes: next.complimentaryCodes,
  }).map((row) => ({ name: row.name, quantity: row.quantity }));
  const amountDue = totalFor(next.paidAddonCodes);
  return generateConfirmationMessage(
    buildConfirmationPayload({
      staffCustomerFacingName: "Whitebird",
      customerName: "Nathanael Debully",
      customerPhone: "0162232003",
      pickupDate: "2026-08-18",
      pickupTime: "16:00",
      items: cakes,
      complimentaryItems,
      paidAddons,
      subtotal: amountDue,
      adjustments: [],
      amountDue,
      includeReceipt,
    }),
  );
}

const birthdayConfirm = confirmFromSelections(
  selections({
    paidAddonCodes: ["birthday_card"],
    birthdayCardMessage: "Happy birthday Mummy! Love Eby, Tun, Papa",
    complimentaryCodes: ["birthday_topper", "candle", "knife"],
  }),
);
assert.match(birthdayConfirm, /Whole Cake;/);
assert.match(birthdayConfirm, /~ Pistachio Chocolate \(Less Sweet\) 6" x1/);
assert.match(birthdayConfirm, /~ Birthday Card x1/);
assert.match(birthdayConfirm, /⭐️Special Request:⭐️/);
assert.match(birthdayConfirm, /~Written message on Birthday Card:/);
assert.match(
  birthdayConfirm,
  /Happy birthday Mummy! Love Eby, Tun, Papa/,
);
assert.match(
  birthdayConfirm,
  /\*Complimentary Birthday Topper x1, Candle x1, Knife x1/,
);
assert.match(birthdayConfirm, /RM135\+RM3\(BC\)=/);
assert.doesNotMatch(birthdayConfirm, /Wishing Card/);

const wishingConfirm = confirmFromSelections(
  selections({
    paidAddonCodes: ["wishing_card"],
    wishingCardMessage: "Wish you a wonderful year",
  }),
);
assert.match(wishingConfirm, /~ Wishing Card x1/);
assert.match(wishingConfirm, /~Written message on Wishing Card:/);
assert.match(wishingConfirm, /Wish you a wonderful year/);
assert.doesNotMatch(wishingConfirm, /Birthday Card/);

const bothConfirm = confirmFromSelections(
  selections({
    paidAddonCodes: ["birthday_card", "wishing_card"],
    birthdayCardMessage: "Happy birthday Mummy! Love Eby, Tun, Papa",
    wishingCardMessage: "Wish you a wonderful year",
  }),
);
assert.match(bothConfirm, /~ Birthday Card x1/);
assert.match(bothConfirm, /~ Wishing Card x1/);
assert.match(bothConfirm, /~Written message on Birthday Card:/);
assert.match(bothConfirm, /~Written message on Wishing Card:/);
assert.match(bothConfirm, /Happy birthday Mummy! Love Eby, Tun, Papa/);
assert.match(bothConfirm, /Wish you a wonderful year/);
assert.match(bothConfirm, /RM135\+RM3\(BC\)\+RM3\(WC\)=/);

const noneConfirm = confirmFromSelections(selections());
assert.doesNotMatch(noneConfirm, /Birthday Card/);
assert.doesNotMatch(noneConfirm, /Wishing Card/);
assert.doesNotMatch(noneConfirm, /Special Request/);
assert.doesNotMatch(noneConfirm, /\*Complimentary/);
assert.doesNotMatch(noneConfirm, /\*Include RECEIPT/);
assert.match(noneConfirm, /RM135/);

const receiptYesConfirm = confirmFromSelections(selections(), true);
assert.match(receiptYesConfirm, /\*Include RECEIPT/);
assert.match(receiptYesConfirm, /RM135/);
assert.doesNotMatch(receiptYesConfirm, /email/i);

const receiptWithOptions = confirmFromSelections(
  selections({
    paidAddonCodes: ["birthday_card", "wishing_card"],
    birthdayCardMessage: "Happy birthday Mummy! Love Eby, Tun, Papa",
    wishingCardMessage: "Wish you a wonderful year",
    complimentaryCodes: ["birthday_topper", "candle", "knife"],
  }),
  true,
);
assert.match(receiptWithOptions, /~ Birthday Card x1/);
assert.match(receiptWithOptions, /~ Wishing Card x1/);
assert.match(receiptWithOptions, /RM135\+RM3\(BC\)\+RM3\(WC\)=/);
assert.match(
  receiptWithOptions,
  /\*Complimentary Birthday Topper x1, Candle x1, Knife x1\n\*Include RECEIPT/,
);

assert.equal(parseRequiredPhysicalReceipt("yes"), true);
assert.equal(parseRequiredPhysicalReceipt("no"), false);
assert.equal(parseRequiredPhysicalReceipt(""), null);
assert.equal(parseRequiredPhysicalReceipt("on"), null);
assert.equal(parseRequiredPhysicalReceipt(true), null);

assert.equal(
  formatComplimentaryLine([
    { name: "Birthday Topper", quantity: 1 },
    { name: "Candle", quantity: 1 },
    { name: "Knife", quantity: 1 },
  ]),
  "Birthday Topper x1, Candle x1, Knife x1",
);

const checkoutSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(checkoutSrc, /submit_guest_preorder/);
assert.match(checkoutSrc, /p_complimentary/);
assert.match(checkoutSrc, /p_paid_addons/);
assert.match(checkoutSrc, /preorder_options_json/);
assert.match(checkoutSrc, /storefront_customer_preorder_options/);
assert.match(checkoutSrc, /customerPaidAddonMutationPayload/);
assert.match(checkoutSrc, /email_submission_receipt_requested/);
assert.match(checkoutSrc, /p_include_receipt/);
assert.match(checkoutSrc, /parseRequiredPhysicalReceipt/);
assert.match(
  checkoutSrc,
  /Please choose whether you would like a copy of the receipt/,
);
assert.doesNotMatch(checkoutSrc, /create_staff_guest_preorder/);
assert.doesNotMatch(checkoutSrc, /unit_price/);

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(formSrc, /Complimentary/);
assert.match(formSrc, />Paid</);
assert.match(formSrc, /complimentaryOptions/);
assert.match(formSrc, /paidAddonOptions/);
assert.match(formSrc, /formatCustomerPreorderOptionLabel/);
assert.match(formSrc, /Written message on \$\{option\.name\}/);
assert.match(formSrc, /email_submission_receipt_requested/);
assert.match(
  formSrc,
  /Would you like a copy of the receipt\? \(will be attached during pickup\)/,
);
assert.match(formSrc, /name="include_receipt"/);
assert.match(formSrc, /\{ value: "yes", label: "Yes" \}/);
assert.match(formSrc, /\{ value: "no", label: "No" \}/);
assert.match(formSrc, /customerPreorderCommercialTotal/);
assert.match(formSrc, /required=\{messageRequired\}/);
assert.match(formSrc, /help="Optional\."/);

const migrationSrc = readSrc(
  "supabase/migrations/20260818120000_guest_preorder_options.sql",
);
assert.match(migrationSrc, /storefront_customer_preorder_options/);
assert.match(migrationSrc, /p_complimentary jsonb default '\[\]'::jsonb/);
assert.match(migrationSrc, /p_paid_addons jsonb default '\[\]'::jsonb/);
assert.match(migrationSrc, /_sync_order_paid_addons_from_payload/);
assert.match(migrationSrc, /birthday_card/);
assert.match(migrationSrc, /wishing_card/);
assert.match(migrationSrc, /Do not auto-insert collection defaults/);
assert.match(migrationSrc, /storefront_collection_for_pickup_date/);
assert.match(migrationSrc, /is_pickup_orders_closed/);
assert.doesNotMatch(migrationSrc, /create_staff_guest_preorder/);

const ambiguityFixSrc = readSrc(
  "supabase/migrations/20260818130000_fix_guest_preorder_addon_ambiguity.sql",
);
assert.match(ambiguityFixSrc, /p_complimentary jsonb default '\[\]'::jsonb/);
assert.match(ambiguityFixSrc, /p_paid_addons jsonb default '\[\]'::jsonb/);
assert.match(ambiguityFixSrc, /as addon_row/);
assert.doesNotMatch(
  ambiguityFixSrc,
  /from jsonb_array_elements\(p_paid_addons\) addon;/,
);

const receiptMigrationSrc = readSrc(
  "supabase/migrations/20260818140000_guest_preorder_include_receipt.sql",
);
assert.match(
  receiptMigrationSrc,
  /p_include_receipt boolean default false/,
);
assert.match(receiptMigrationSrc, /v_include_receipt := coalesce\(p_include_receipt, false\)/);
assert.match(receiptMigrationSrc, /include_receipt/);
assert.match(receiptMigrationSrc, /email_submission_receipt_requested/);
assert.match(receiptMigrationSrc, /as addon_row/);
assert.doesNotMatch(receiptMigrationSrc, /alter table public\.orders add/i);
assert.doesNotMatch(
  receiptMigrationSrc,
  /email_submission_receipt_requested\s*=/,
);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
assert.match(extraFormSrc, /name="include_receipt"/);
assert.match(
  extraFormSrc,
  /Would you like a copy of the receipt\? \(will be attached during pickup\)/,
);
assert.match(extraFormSrc, /email_submission_receipt_requested/);
assert.match(extraFormSrc, /name="complimentary_code"/);
assert.doesNotMatch(extraFormSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraFormSrc, /GuestCheckoutForm/);
assert.doesNotMatch(extraFormSrc, /birthday_card/);
assert.doesNotMatch(extraFormSrc, /wishing_card/);

const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
assert.match(extraActionsSrc, /p_include_receipt/);
assert.match(extraActionsSrc, /p_complimentary/);
assert.match(extraActionsSrc, /parseRequiredPhysicalReceipt/);
assert.match(extraActionsSrc, /email_submission_receipt_requested/);
assert.doesNotMatch(extraActionsSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraActionsSrc, /p_paid_addons/);

console.log("PASS customer preorder options / confirmation mapping");
