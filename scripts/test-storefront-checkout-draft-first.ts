/**
 * Checkout Phase 1: draft-first order summary.
 * Run: npx tsx scripts/test-storefront-checkout-draft-first.ts
 *
 * Display-only. Does not submit orders or mutate catalogues.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateCollectionDate } from "@/engines/preorder/validate";
import {
  checkoutDraftItemsInCatalogue,
  isCheckoutCalendarPending,
  isCheckoutLiveOfferPending,
} from "@/workspaces/storefront/checkout/checkout-draft-availability";
import { draftItemSizeChoices } from "@/workspaces/storefront/cart/cart-order-summary";
import type { PreorderDraftItem } from "@/workspaces/storefront/checkout/preorder-draft";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const formSrc = readSrc("src/workspaces/storefront/checkout/GuestCheckoutForm.tsx");
const summarySrc = readSrc(
  "src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx",
);
const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const extraSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);

const avocado: PreorderDraftItem = {
  cakeId: "cake-avocado",
  sizeId: "size-6",
  quantity: 1,
  cakeName: "Avocado",
  sizeLabel: '6"',
  unitPrice: 135,
  preorderDays: 3,
  imageUrl: "https://example.com/avocado.jpg",
  sizeChoices: [
    { id: "size-6", size: '6"', price: 135, preorderDays: 3 },
    { id: "size-8", size: '8"', price: 185, preorderDays: 3 },
  ],
};
const second: PreorderDraftItem = {
  cakeId: "cake-pandan",
  sizeId: "size-p6",
  quantity: 2,
  cakeName: "Pandan",
  sizeLabel: '6"',
  unitPrice: 120,
  imageUrl: "https://example.com/pandan.jpg",
};
const third: PreorderDraftItem = {
  cakeId: "cake-mango",
  sizeId: "size-m6",
  quantity: 1,
  cakeName: "Mango",
  sizeLabel: '6"',
  unitPrice: 128,
};

assert.equal(isCheckoutLiveOfferPending("", null), false);
assert.equal(isCheckoutLiveOfferPending("2026-09-15", null), true);
assert.equal(isCheckoutLiveOfferPending("2026-09-15", "2026-09-14"), true);
assert.equal(isCheckoutLiveOfferPending("2026-09-15", "2026-09-15"), false);
assert.equal(isCheckoutCalendarPending(false), true);
assert.equal(isCheckoutCalendarPending(true), false);

assert.equal(
  checkoutDraftItemsInCatalogue([avocado, second, third], [], true),
  true,
  "pending live offer is not unavailable",
);
assert.equal(
  checkoutDraftItemsInCatalogue([], [], false),
  true,
  "empty cart stays empty, not invalid",
);
assert.equal(
  checkoutDraftItemsInCatalogue(
    [avocado],
    [
      {
        id: "cake-avocado",
        sizes: [{ id: "size-6" }, { id: "size-8" }],
      },
    ],
    false,
  ),
  true,
);
assert.equal(
  checkoutDraftItemsInCatalogue(
    [avocado],
    [{ id: "other-cake", sizes: [{ id: "other-size" }] }],
    false,
  ),
  false,
  "loaded offer without the draft cake is unavailable",
);

const pendingEval = evaluateCollectionDate({
  selectedYmd: "2026-09-20",
  businessDate: "2026-09-12",
  lines: [
    {
      lineId: "cake-avocado::size-6",
      cakeId: avocado.cakeId,
      cakeSizeId: avocado.sizeId,
      cakeName: avocado.cakeName,
      sizeLabel: avocado.sizeLabel,
      quantity: avocado.quantity,
      preorderDays: 3,
    },
  ],
  operatingOpen: true,
  closed: false,
  inCatalogue: checkoutDraftItemsInCatalogue([avocado], [], true),
});
assert.equal(pendingEval.valid, true);
assert.equal(pendingEval.reason.code, "ok");

const unavailableEval = evaluateCollectionDate({
  selectedYmd: "2026-09-20",
  businessDate: "2026-09-12",
  lines: [
    {
      lineId: "cake-avocado::size-6",
      cakeId: avocado.cakeId,
      cakeSizeId: avocado.sizeId,
      cakeName: avocado.cakeName,
      sizeLabel: avocado.sizeLabel,
      quantity: avocado.quantity,
      preorderDays: 3,
    },
  ],
  operatingOpen: true,
  closed: false,
  inCatalogue: checkoutDraftItemsInCatalogue(
    [avocado],
    [{ id: "other-cake", sizes: [{ id: "other-size" }] }],
    false,
  ),
});
assert.equal(unavailableEval.valid, false);
assert.equal(unavailableEval.reason.code, "not_in_catalogue");

const draftSizes = draftItemSizeChoices(avocado, null);
assert.equal(draftSizes.length, 2);
assert.equal(draftSizes[0]?.id, "size-6");
assert.equal(draftSizes[0]?.price, 135);

assert.match(summarySrc, /draftItemSizeChoices/);
assert.match(summarySrc, /item\.cakeName/);
assert.match(summarySrc, /item\.imageUrl/);
assert.match(summarySrc, /item\.unitPrice \* item\.quantity/);
assert.match(summarySrc, /Checking availability for that date/);
assert.doesNotMatch(summarySrc, /Loading cakes for that date/);
assert.match(summarySrc, /items\.length === 0/);
assert.match(
  summarySrc,
  /\{loadingOffer \? null : addingCake \?/,
);
assert.doesNotMatch(
  summarySrc.split("{items.length === 0")[0] ?? "",
  /loadingOffer \? \(\s*<p className="text-skyline text-sm" aria-live="polite">/,
);

assert.match(formSrc, /checkoutDraftItemsInCatalogue/);
assert.match(formSrc, /isCheckoutLiveOfferPending/);
assert.match(formSrc, /resolvedOfferDate/);
assert.match(formSrc, /liveOfferPending/);
assert.match(formSrc, /draftItemSizeChoices\(item, cake\)/);
assert.match(formSrc, /if \(calendarPending \|\| liveOfferPending\) \{\s*return;/);
assert.doesNotMatch(formSrc, /setLoadingOffer/);
assert.match(formSrc, /imageUrl: item\.imageUrl/);

assert.match(actionsSrc, /export async function submitGuestPreorderAction/);
assert.match(actionsSrc, /listAvailableCakes\(collection\.id\)/);
assert.match(actionsSrc, /inCatalogue: true/);
assert.doesNotMatch(extraSrc, /checkoutDraftItemsInCatalogue/);
assert.doesNotMatch(extraSrc, /CheckoutOrderSummary/);

console.log("PASS storefront checkout draft-first");
