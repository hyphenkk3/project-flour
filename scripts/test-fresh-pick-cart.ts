/**
 * Fresh Pick cart: add does not claim stock; submit claims exact extra_stock.id.
 * Run: npx tsx scripts/test-fresh-pick-cart.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extraCartItemUnavailableMessage,
  FRESH_PICKS_ADD_ANOTHER_CTA,
  FRESH_PICKS_ADD_TO_CART_CTA,
  FRESH_PICKS_ADDED_CONFIRMATION,
  FRESH_PICKS_ADDED_TO_CART_CTA,
  FRESH_PICKS_ALREADY_IN_CART,
  FRESH_PICKS_CART_PICKUP_MISMATCH,
  freshPickCartCtaLabel,
} from "@/engines/extra/customer-fresh-picks";
import { EXTRA_SAME_DAY_PICKUP_LEAD_MS } from "@/engines/extra/extra-pickup";
import {
  addFreshPickToCart,
  emptyFreshPickCart,
  extraIsValidForCartPickup,
  FRESH_PICK_CART_KEY,
  freshPickCartCount,
  freshPickCartHasExtra,
  freshPickCatalogueCtaState,
  freshPickCartHasItems,
  freshPickCartTotal,
  parseFreshPickCart,
  removeFreshPickFromCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const avocadoA = {
  extraStockId: "extra-avocado-a",
  cakeName: "Avocado",
  sizeLabel: '6"',
  unitPrice: 90,
  imageUrl: null,
  pickupDate: "2026-09-09",
  pickupTime: "14:00",
  pickupAvailableFromAt: "2026-09-09T02:00:00.000Z",
  orderCutoffAt: "2026-09-09T14:00:00.000Z",
};

const avocadoB = {
  ...avocadoA,
  extraStockId: "extra-avocado-b",
};

const peanut = {
  extraStockId: "extra-peanut-c",
  cakeName: "Salted Peanut",
  sizeLabel: '6"',
  unitPrice: 88,
  imageUrl: null,
  pickupDate: "2026-09-09",
  pickupTime: "14:00",
  pickupAvailableFromAt: "2026-09-09T02:00:00.000Z",
  orderCutoffAt: "2026-09-09T14:00:00.000Z",
};

const now = new Date("2026-09-09T04:00:00.000Z");

const first = addFreshPickToCart(null, avocadoA, now);
assert.equal(first.ok, true);
assert.ok(first.ok && first.added);
assert.equal(first.ok && first.cart.items[0]?.extraStockId, "extra-avocado-a");
assert.equal(freshPickCartCount(first.ok ? first.cart : null), 1);
assert.equal(freshPickCartTotal(first.ok ? first.cart : null), 90);

const cart = first.ok ? first.cart : emptyFreshPickCart();
const secondSame = addFreshPickToCart(cart, avocadoA, now);
assert.equal(secondSame.ok, false);
assert.equal(!secondSame.ok && secondSame.error, FRESH_PICKS_ALREADY_IN_CART);

const twoAvocados = addFreshPickToCart(cart, avocadoB, now);
assert.equal(twoAvocados.ok, true);
assert.equal(twoAvocados.ok && twoAvocados.cart.items.length, 2);
assert.deepEqual(
  twoAvocados.ok
    ? twoAvocados.cart.items.map((item) => item.extraStockId)
    : [],
  ["extra-avocado-a", "extra-avocado-b"],
);

const three = addFreshPickToCart(
  twoAvocados.ok ? twoAvocados.cart : cart,
  peanut,
  now,
);
assert.equal(three.ok, true);
assert.equal(three.ok && three.cart.items.length, 3);

const mismatch = addFreshPickToCart(
  cart,
  { ...peanut, pickupTime: "15:00" },
  now,
);
assert.equal(mismatch.ok, false);
assert.equal(
  !mismatch.ok && mismatch.error,
  FRESH_PICKS_CART_PICKUP_MISMATCH,
);

const tomorrowOnly = addFreshPickToCart(cart, {
  ...peanut,
  extraStockId: "extra-tomorrow",
  pickupDate: "2026-09-09",
  pickupTime: "14:00",
  pickupAvailableFromAt: "2026-09-10T02:00:00.000Z",
  orderCutoffAt: "2026-09-10T14:00:00.000Z",
}, now);
assert.equal(tomorrowOnly.ok, false);
assert.equal(
  !tomorrowOnly.ok && tomorrowOnly.error,
  "Please choose a valid pickup time for that date.",
);

assert.equal(
  extraIsValidForCartPickup({
    pickupDate: "2026-09-09",
    pickupTime: "14:00",
    pickupAvailableFromAt: avocadoA.pickupAvailableFromAt,
    orderCutoffAt: avocadoA.orderCutoffAt,
    now,
  }),
  true,
);

const parsed = parseFreshPickCart({
  pickupDate: "2026-09-09",
  pickupTime: "14:00",
  items: [
    {
      extraStockId: "extra-avocado-a",
      cakeName: "Avocado",
      sizeLabel: '6"',
      unitPrice: 90,
      pickupDate: "2026-09-09",
      pickupTime: "14:00",
    },
  ],
});
assert.equal(parsed?.items[0]?.extraStockId, "extra-avocado-a");
assert.equal(freshPickCartHasItems(parsed), true);

const removed = removeFreshPickFromCart(parsed!, "extra-avocado-a");
assert.equal(removed.items.length, 0);
assert.equal(freshPickCartHasItems(removed), false);

assert.equal(
  extraCartItemUnavailableMessage("Avocado"),
  "Avocado is no longer available. Remove it from your order to continue.",
);
assert.equal(FRESH_PICKS_ADD_TO_CART_CTA, "Add to Cart");
assert.equal(FRESH_PICKS_ADDED_TO_CART_CTA, "✓ Added to Cart");
assert.equal(FRESH_PICKS_ADD_ANOTHER_CTA, "Add another");
assert.equal(freshPickCartCtaLabel(false), "Add to Cart");
assert.equal(freshPickCartCtaLabel(true), "✓ Added to Cart");
assert.equal(
  freshPickCartHasExtra(null, avocadoA.extraStockId),
  false,
  "exact unit not in cart",
);
assert.equal(
  freshPickCartCtaLabel(freshPickCartHasExtra(null, avocadoA.extraStockId)),
  FRESH_PICKS_ADD_TO_CART_CTA,
);
assert.equal(
  freshPickCartHasExtra(first.ok ? first.cart : null, avocadoA.extraStockId),
  true,
  "exact unit in cart",
);
assert.equal(
  freshPickCartCtaLabel(
    freshPickCartHasExtra(first.ok ? first.cart : null, avocadoA.extraStockId),
  ),
  FRESH_PICKS_ADDED_TO_CART_CTA,
);
assert.equal(
  freshPickCartHasExtra(first.ok ? first.cart : null, avocadoB.extraStockId),
  false,
  "identical second unit stays Add to Cart",
);
assert.equal(
  freshPickCartCtaLabel(
    freshPickCartHasExtra(first.ok ? first.cart : null, avocadoB.extraStockId),
  ),
  FRESH_PICKS_ADD_TO_CART_CTA,
);
assert.equal(
  freshPickCartHasExtra(
    twoAvocados.ok ? twoAvocados.cart : null,
    avocadoA.extraStockId,
  ),
  true,
);
assert.equal(
  freshPickCartHasExtra(
    twoAvocados.ok ? twoAvocados.cart : null,
    avocadoB.extraStockId,
  ),
  true,
  "both exact units added",
);
assert.equal(
  freshPickCartCtaLabel(
    freshPickCartHasExtra(
      twoAvocados.ok ? twoAvocados.cart : null,
      avocadoA.extraStockId,
    ),
  ),
  FRESH_PICKS_ADDED_TO_CART_CTA,
);
assert.equal(
  freshPickCartCtaLabel(
    freshPickCartHasExtra(
      twoAvocados.ok ? twoAvocados.cart : null,
      avocadoB.extraStockId,
    ),
  ),
  FRESH_PICKS_ADDED_TO_CART_CTA,
);

const removedOne = removeFreshPickFromCart(
  twoAvocados.ok ? twoAvocados.cart : cart,
  avocadoA.extraStockId,
);
assert.equal(
  freshPickCartHasExtra(removedOne, avocadoA.extraStockId),
  false,
  "removed exact unit returns to Add to Cart",
);
assert.equal(
  freshPickCartCtaLabel(freshPickCartHasExtra(removedOne, avocadoA.extraStockId)),
  FRESH_PICKS_ADD_TO_CART_CTA,
);
assert.equal(
  freshPickCartHasExtra(removedOne, avocadoB.extraStockId),
  true,
  "sibling unit stays Added to Cart",
);
assert.equal(
  freshPickCartCtaLabel(freshPickCartHasExtra(removedOne, avocadoB.extraStockId)),
  FRESH_PICKS_ADDED_TO_CART_CTA,
);

const sessionPayload = JSON.stringify({
  pickupDate: "2026-09-09",
  pickupTime: "14:00",
  items: [
    {
      extraStockId: "extra-avocado-a",
      cakeName: "Avocado",
      sizeLabel: '6"',
      unitPrice: 90,
      pickupDate: "2026-09-09",
      pickupTime: "14:00",
    },
    {
      extraStockId: "extra-avocado-b",
      cakeName: "Avocado",
      sizeLabel: '6"',
      unitPrice: 90,
      pickupDate: "2026-09-09",
      pickupTime: "14:00",
    },
  ],
});
const hydrated = parseFreshPickCart(JSON.parse(sessionPayload) as unknown);
assert.equal(
  freshPickCartCtaLabel(
    freshPickCartHasExtra(hydrated, "extra-avocado-a"),
  ),
  FRESH_PICKS_ADDED_TO_CART_CTA,
  "sessionStorage hydration restores Added to Cart",
);
assert.equal(
  freshPickCartCtaLabel(
    freshPickCartHasExtra(hydrated, "extra-avocado-b"),
  ),
  FRESH_PICKS_ADDED_TO_CART_CTA,
);
assert.equal(
  freshPickCartCtaLabel(freshPickCartHasExtra(hydrated, "extra-peanut-c")),
  FRESH_PICKS_ADD_TO_CART_CTA,
);

const groupedIds = ["extra-avocado-a", "extra-avocado-b"];
assert.deepEqual(
  freshPickCatalogueCtaState(groupedIds, null),
  {
    extraStockId: "extra-avocado-a",
    addedToCart: false,
    addAnotherStockId: null,
  },
  "none in cart → Add to Cart",
);
assert.deepEqual(
  freshPickCatalogueCtaState(groupedIds, first.ok ? first.cart : null),
  {
    extraStockId: "extra-avocado-a",
    addedToCart: true,
    addAnotherStockId: "extra-avocado-b",
  },
  "first id in cart → Added to Cart + Add another",
);
assert.equal(
  twoAvocados.ok && twoAvocados.cart.items[0]?.extraStockId,
  "extra-avocado-a",
  "first exact id remains after Add another",
);
assert.equal(
  twoAvocados.ok && twoAvocados.cart.items[1]?.extraStockId,
  "extra-avocado-b",
  "Add another uses a different extra_stock.id",
);
assert.deepEqual(
  freshPickCatalogueCtaState(groupedIds, twoAvocados.ok ? twoAvocados.cart : null),
  {
    extraStockId: "extra-avocado-a",
    addedToCart: true,
    addAnotherStockId: null,
  },
  "both ids in cart → Added to Cart, no Add another",
);

const afterRemoveOne = removeFreshPickFromCart(
  twoAvocados.ok ? twoAvocados.cart : cart,
  "extra-avocado-a",
);
assert.deepEqual(
  afterRemoveOne.items.map((item) => item.extraStockId),
  ["extra-avocado-b"],
);
assert.deepEqual(
  freshPickCatalogueCtaState(groupedIds, afterRemoveOne),
  {
    extraStockId: "extra-avocado-b",
    addedToCart: true,
    addAnotherStockId: "extra-avocado-a",
  },
  "removing one exact id restores Add another",
);
assert.deepEqual(
  freshPickCatalogueCtaState(
    groupedIds,
    removeFreshPickFromCart(afterRemoveOne, "extra-avocado-b"),
  ),
  {
    extraStockId: "extra-avocado-a",
    addedToCart: false,
    addAnotherStockId: null,
  },
  "removing all exact ids returns Add to Cart",
);

assert.equal(FRESH_PICKS_ADDED_CONFIRMATION, "Added to your order.");
assert.equal(EXTRA_SAME_DAY_PICKUP_LEAD_MS, 60 * 60 * 1000);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraCheckoutSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const extraQueriesSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
const extraOrderPageSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
const cartSrc = readSrc("src/workspaces/storefront/extra/fresh-pick-cart.ts");
const cartShellSrc = readSrc(
  "src/workspaces/storefront/extra/FreshPickCartShell.tsx",
);
const wholeCakeCartSrc = readSrc(
  "src/workspaces/storefront/cart/StorefrontCartShell.tsx",
);
const wholeCakeDraftSrc = readSrc(
  "src/workspaces/storefront/checkout/preorder-draft.ts",
);
const addToOrderSrc = readSrc(
  "src/workspaces/storefront/cart/AddToOrderSheet.tsx",
);
const rpcSrc = readSrc(
  "supabase/migrations/20260909140000_guest_extra_cart_multi_claim.sql",
);
const extraPickupSrc = readSrc("src/engines/extra/extra-pickup.ts");
const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);

assert.match(extraFormSrc, /FRESH_PICKS_ADD_TO_CART_CTA/);
assert.match(extraFormSrc, /FRESH_PICKS_ADDED_TO_CART_CTA/);
assert.match(extraFormSrc, /useFreshPickCart/);
assert.match(extraFormSrc, /freshPickCartHasExtra/);
assert.match(extraFormSrc, /addFreshPickToCart/);
assert.match(extraFormSrc, /writeFreshPickCart/);
assert.doesNotMatch(extraFormSrc, /submitGuestExtraOrderAction/);
assert.doesNotMatch(extraFormSrc, /sold_at/);
assert.doesNotMatch(extraFormSrc, /submit_guest_extra_order/);
assert.match(extraFormSrc, /FRESH_PICKS_ADDED_CONFIRMATION/);
assert.match(extraFormSrc, /name="extra_stock_id"/);
assert.match(extraFormSrc, /extraCustomerPickupSlotsForDate/);

assert.match(extraCheckoutSrc, /submitGuestExtraOrderAction/);
assert.match(extraCheckoutSrc, /CheckoutConfirmPrompt/);
assert.match(extraCheckoutSrc, /name="extra_stock_id"/);
assert.match(extraCheckoutSrc, /getAll\("extra_stock_id"\)|name="extra_stock_id"/);
assert.match(extraCheckoutSrc, /FRESH_PICKS_SUCCESS_FLOW/);
assert.match(extraCheckoutSrc, /window\.location\.assign/);

assert.match(extraActionsSrc, /getAll\("extra_stock_id"\)/);
assert.match(extraActionsSrc, /p_extra_stock_ids: extraStockIds/);
assert.match(extraActionsSrc, /getStorefrontExtraById/);
assert.match(extraActionsSrc, /extraCartItemUnavailableMessage/);
assert.match(extraActionsSrc, /isValidExtraCustomerPickup/);
assert.doesNotMatch(extraActionsSrc, /libraryCakeId/);
assert.doesNotMatch(extraActionsSrc, /production_capacity/);

assert.doesNotMatch(extraQueriesSrc, /selectCustomerFreshPickOfferings/);
assert.match(extraQueriesSrc, /groupCustomerFreshPickOfferings/);
assert.match(extraQueriesSrc, /sortCustomerFreshPicksByAvailabilityDay\(picks\)/);
assert.match(extraQueriesSrc, /\.is\("sold_at", null\)/);

assert.match(extraPageSrc, /FreshPickCartShell/);
assert.match(extraPageSrc, /FRESH_PICKS_ADD_TO_CART_CTA/);
assert.match(extraPageSrc, /FreshPickCatalogueAddCta/);
assert.match(extraPageSrc, /extraStockIds=\{pick\.extraStockIds\}/);
assert.match(extraPageSrc, /href=\{\`\/extra\/\$\{pick\.id\}\`\}/);
assert.doesNotMatch(extraPageSrc, /1 left/);
assert.doesNotMatch(extraPageSrc, /2 available/);
assert.doesNotMatch(extraPageSrc, /units available/i);

const catalogueCtaSrc = readSrc(
  "src/workspaces/storefront/extra/FreshPickCatalogueAddCta.tsx",
);
assert.match(catalogueCtaSrc, /useFreshPickCart/);
assert.match(catalogueCtaSrc, /freshPickCatalogueCtaState/);
assert.match(catalogueCtaSrc, /FRESH_PICKS_ADDED_TO_CART_CTA/);
assert.match(catalogueCtaSrc, /FRESH_PICKS_ADD_ANOTHER_CTA/);
assert.match(catalogueCtaSrc, /extraStockIds/);
assert.match(catalogueCtaSrc, /addAnotherStockId/);
assert.doesNotMatch(catalogueCtaSrc, /1 left/);
assert.doesNotMatch(catalogueCtaSrc, /2 available/);
assert.doesNotMatch(catalogueCtaSrc, /sold_at/);
assert.doesNotMatch(catalogueCtaSrc, /production_capacity/);
assert.match(extraOrderPageSrc, /FreshPickCartShell/);
assert.doesNotMatch(extraPageSrc, /StorefrontCartShell/);
assert.doesNotMatch(extraOrderPageSrc, /StorefrontCartShell/);

assert.match(cartSrc, /FRESH_PICK_CART_KEY = "whitebird-fresh-pick-cart-v1"/);
assert.match(cartSrc, /extraStockId/);
assert.doesNotMatch(cartSrc, /sold_at/);
assert.doesNotMatch(cartSrc, /submit_guest_extra_order/);
assert.doesNotMatch(cartSrc, /whitebird-preorder-draft-v1/);

assert.match(cartShellSrc, /href=\{freshPickCheckoutHref\(\)\}/);
assert.doesNotMatch(
  cartShellSrc,
  /href=\{freshPickCheckoutHref\(\)\}[\s\S]{0,80}onClick=\{onContinue\}/,
);
assert.match(cartShellSrc, /\{itemLabel\} · \{formatRm\(total\)\}/);
assert.match(cartShellSrc, /Remove/);
assert.match(cartShellSrc, /pickupLabel/);
assert.doesNotMatch(cartShellSrc, /production_capacity/);

assert.match(wholeCakeDraftSrc, /whitebird-preorder-draft-v1/);
assert.doesNotMatch(wholeCakeDraftSrc, /extra_stock/);
assert.doesNotMatch(wholeCakeCartSrc, /extra_stock/);
assert.doesNotMatch(addToOrderSrc, /extra_stock/);
assert.doesNotMatch(addToOrderSrc, /FRESH_PICK_CART_KEY/);

assert.match(rpcSrc, /p_extra_stock_ids uuid\[\]/);
assert.match(rpcSrc, /for update/);
assert.match(rpcSrc, /and e\.sold_at is null/);
assert.match(rpcSrc, /e\.id = any\(v_ids\)/);
assert.match(rpcSrc, /v_updated <> v_expected/);
assert.match(rpcSrc, /cut_into_slices_at is not null/);
assert.match(rpcSrc, /add column if not exists order_id/);
assert.doesNotMatch(rpcSrc, /production_capacity/);

assert.match(extraPickupSrc, /EXTRA_SAME_DAY_PICKUP_LEAD_MS = 60 \* 60 \* 1000/);
assert.match(extraFormSrc, /extraCustomerPickupSlotsForDate/);
assert.doesNotMatch(extraPickupSrc, /getPickupSlotsForDate/);

assert.match(successSrc, /ClearFreshPickCartOnSuccess/);
assert.match(
  successSrc,
  /isFreshPick \? <ClearFreshPickCartOnSuccess \/> : <ClearPreorderDraftOnSuccess/,
);

assert.equal(FRESH_PICK_CART_KEY, "whitebird-fresh-pick-cart-v1");

console.log("PASS Fresh Pick cart");
