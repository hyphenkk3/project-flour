/**
 * Whole-checkout interaction audit: local UI stays local, date work stays
 * targeted, and typing must not retrigger slot/capacity/server work.
 * Run: npx tsx scripts/test-storefront-checkout-interactions.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyApplicableUnitPrices } from "@/engines/orders/cake-size-price-ack";
import { checkoutCartCapacityKey } from "@/workspaces/storefront/checkout/checkout-draft-availability";
import {
  emptyPreorderDraft,
  PREORDER_DRAFT_KEY,
  writePreorderDraft,
} from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const pageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
const routeSrc = readSrc("src/app/order/checkout/page.tsx");
const promptSrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutConfirmPrompt.tsx",
);
const slotSrc = readSrc("src/components/ui/PickupSlotFields.tsx");
const draftSrc = readSrc(
  "src/workspaces/storefront/checkout/preorder-draft.ts",
);
const summarySrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);

assert.doesNotMatch(routeSrc, /await searchParams/);
assert.doesNotMatch(formSrc, /router\.refresh/);
assert.doesNotMatch(formSrc, /StorefrontCheckoutLoading/);
assert.doesNotMatch(pageSrc, /StorefrontCheckoutLoading/);
assert.doesNotMatch(promptSrc, /formAction/);

const handleSubmitSrc = formSrc.slice(
  formSrc.indexOf("function handleSubmit"),
  formSrc.indexOf("function confirmOrder"),
);
assert.match(handleSubmitSrc, /setConfirmOpen\(true\)/);
assert.doesNotMatch(handleSubmitSrc, /formAction\(/);
assert.doesNotMatch(handleSubmitSrc, /loadCheckoutPickupOffer/);

const ackToggleSrc = formSrc.slice(
  formSrc.indexOf('name="price_ack_accepted"'),
  formSrc.indexOf('name="price_ack_accepted"') + 500,
);
assert.match(ackToggleSrc, /setAcknowledgedSnapshot/);
assert.doesNotMatch(ackToggleSrc, /loadCheckoutPickupOffer/);
assert.doesNotMatch(ackToggleSrc, /formAction\(/);

assert.match(formSrc, /useLayoutEffect/);
assert.match(formSrc, /checkoutCartCapacityKey/);
assert.match(formSrc, /checkoutPickupOfferCache/);
assert.match(formSrc, /checkoutCakeSizePriceCache/);
assert.match(formSrc, /loadCheckoutDateConfirmation\(/);
assert.match(formSrc, /resolveCheckoutCakeSizePrices\(pickupDate, sizeIds\)/);
assert.match(formSrc, /checkoutCakeSizePriceCache\.clear/);
assert.match(formSrc, /Price updated for your selected pickup date/);
assert.doesNotMatch(
  formSrc.slice(
    formSrc.indexOf("loadCartDateCapacityAvailability"),
    formSrc.indexOf("loadCustomerWaitingListAvailability"),
  ),
  /\n\s+items,\n/,
);

assert.match(slotSrc, /onTimeChangeRef/);
assert.match(slotSrc, /slotsForDateRef/);
assert.doesNotMatch(
  slotSrc.slice(slotSrc.indexOf("if (!date || !time) return;")),
  /onTimeChange, slotsForDate, time/,
);

assert.match(draftSrc, /sessionStorage\.getItem\(PREORDER_DRAFT_KEY\) === payload/);
assert.match(summarySrc, /memo\(CheckoutOrderSummaryView\)/);
assert.match(summarySrc, /Checking availability for that date/);

assert.equal(
  checkoutCartCapacityKey([
    { cakeId: "a", sizeId: "s", quantity: 1 },
    { cakeId: "b", sizeId: "t", quantity: 2 },
  ]),
  "a|s|1,b|t|2",
);
assert.equal(
  checkoutCartCapacityKey([
    { cakeId: "a", sizeId: "s", quantity: 1 },
  ]),
  checkoutCartCapacityKey([
    { cakeId: "a", sizeId: "s", quantity: 1 },
  ]),
);

const quoted = {
  cakeId: "cake",
  sizeId: "size-6",
  unitPrice: 78,
  applicableUnitPrice: 80,
};
const first = applyApplicableUnitPrices([quoted], { "size-6": 80 });
assert.equal(first[0], quoted);
assert.equal(applyApplicableUnitPrices(first, { "size-6": 80 }), first);

function withDraftStorage(run: (calls: { set: number; events: number }) => void) {
  const data = new Map<string, string>();
  const calls = { set: 0, events: 0 };
  const previous = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          calls.set += 1;
          data.set(key, value);
        },
        removeItem: (key: string) => {
          data.delete(key);
        },
      },
      dispatchEvent: () => {
        calls.events += 1;
        return true;
      },
    },
  });
  try {
    run(calls);
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previous,
      });
    }
  }
}

withDraftStorage((calls) => {
  const draft = emptyPreorderDraft();
  draft.customerName = "Wei";
  writePreorderDraft(draft);
  writePreorderDraft({ ...draft, customerName: "Wei" });
  assert.equal(calls.set, 1);
  assert.equal(calls.events, 1);
  writePreorderDraft({ ...draft, customerName: "Wei Checkout" });
  assert.equal(calls.set, 2);
  assert.equal(calls.events, 2);
  assert.ok(
    JSON.parse(String(globalThis.window.sessionStorage.getItem(PREORDER_DRAFT_KEY)))
      .customerName === "Wei Checkout",
  );
});

console.log("PASS storefront checkout interactions");
