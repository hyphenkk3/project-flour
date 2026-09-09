/**
 * Fresh Pick checkout paid add-ons reuse the Whole Cake catalog.
 * Run: npx tsx scripts/test-guest-extra-paid-addons.ts
 *
 * Static only. Does not mutate extras, orders, or catalogues.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  customerPaidAddonMutationPayload,
  customerPreorderCommercialTotal,
  emptyCustomerPreorderSelections,
  selectCustomerPaidAddonOptions,
  type CustomerPaidAddonOption,
} from "@/engines/orders/customer-preorder-options";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const paidOptions: CustomerPaidAddonOption[] = selectCustomerPaidAddonOptions([
  {
    code: "wishing_card",
    name: "Wishing Card",
    unitPrice: 3,
    financialShorthand: "WC",
    sortOrder: 2,
  },
  {
    code: "birthday_card",
    name: "Birthday Card",
    unitPrice: 3,
    financialShorthand: "BC",
    sortOrder: 1,
  },
  {
    code: "ignored",
    name: "Not a customer add-on",
    unitPrice: 99,
    financialShorthand: "X",
    sortOrder: 0,
  },
]);

assert.deepEqual(
  paidOptions.map((row) => row.code),
  ["birthday_card", "wishing_card"],
);

assert.equal(
  customerPreorderCommercialTotal({
    items: [{ unitPrice: 135, quantity: 1 }],
    options: paidOptions,
    selectedCodes: [],
  }),
  135,
);
assert.equal(
  customerPreorderCommercialTotal({
    items: [{ unitPrice: 135, quantity: 1 }],
    options: paidOptions,
    selectedCodes: ["birthday_card"],
  }),
  138,
);
assert.equal(
  customerPreorderCommercialTotal({
    items: [{ unitPrice: 135, quantity: 1 }],
    options: paidOptions,
    selectedCodes: ["birthday_card", "wishing_card"],
  }),
  141,
);

const none = customerPaidAddonMutationPayload({
  options: paidOptions,
  selections: emptyCustomerPreorderSelections(),
});
assert.deepEqual(none, []);

const birthday = customerPaidAddonMutationPayload({
  options: paidOptions,
  selections: {
    ...emptyCustomerPreorderSelections(),
    paidAddonCodes: ["birthday_card"],
    birthdayCardMessage: "Happy birthday",
  },
});
assert.equal(birthday.length, 1);
assert.equal(birthday[0]?.code, "birthday_card");
assert.equal(birthday[0]?.quantity, 1);
assert.deepEqual(birthday[0]?.messages, ["Happy birthday"]);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
assert.match(extraFormSrc, /paidAddonOptions/);
assert.match(extraFormSrc, /name="paid_addon_code"/);
assert.match(extraFormSrc, />Paid</);
assert.match(extraFormSrc, /customerPreorderCommercialTotal/);
assert.match(extraFormSrc, /name="complimentary_code"/);
assert.match(extraFormSrc, /loadExtraCustomerOptions/);
assert.doesNotMatch(extraFormSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraFormSrc, /GuestCheckoutForm/);

const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
assert.match(extraActionsSrc, /storefront_customer_preorder_options/);
assert.match(extraActionsSrc, /payload\.paidAddons/);
assert.match(extraActionsSrc, /payload\.complimentary/);
assert.match(extraActionsSrc, /customerPaidAddonMutationPayload/);
assert.match(extraActionsSrc, /p_paid_addons/);
assert.match(extraActionsSrc, /p_complimentary/);
assert.match(extraActionsSrc, /submit_guest_extra_order/);
assert.doesNotMatch(extraActionsSrc, /submit_guest_preorder/);

const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
assert.match(checkoutActionsSrc, /submit_guest_preorder/);
assert.match(checkoutActionsSrc, /p_paid_addons/);
assert.doesNotMatch(checkoutActionsSrc, /submit_guest_extra_order/);

const checkoutFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(checkoutFormSrc, /paidAddonOptions/);
assert.match(checkoutFormSrc, />Paid</);

const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
assert.match(successSrc, /receipt\.paidAddons\.map/);
assert.match(successSrc, /receipt\.complimentaryItems\.map/);
assert.match(successSrc, /receipt\.notes/);

const receiptLoaderSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
assert.match(receiptLoaderSrc, /customer_notes,/);
assert.match(receiptLoaderSrc, /order_complimentary_items \(/);
assert.doesNotMatch(receiptLoaderSrc, /^\s+notes,$/m);

const migrationSrc = readSrc(
  "supabase/migrations/20260908180000_guest_extra_paid_addons.sql",
);
assert.match(migrationSrc, /p_paid_addons jsonb default '\[\]'::jsonb/);
assert.match(migrationSrc, /_sync_order_paid_addons_from_payload/);
assert.match(migrationSrc, /submit_guest_extra_order/);
assert.doesNotMatch(migrationSrc, /submit_guest_preorder/);
assert.doesNotMatch(migrationSrc, /alter table public\.orders add/i);

console.log("PASS extra paid add-ons reuse Whole Cake catalog");
