/**
 * Mobile catalogue two-column grid and cart overlay stacking (static).
 * Run: npx tsx scripts/test-storefront-mobile-catalogue-cart.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const catalogueSrc = readSrc(
  "src/workspaces/storefront/catalog/BrowseCakeCatalogue.tsx",
);
const cardSrc = readSrc("src/workspaces/storefront/catalog/StorefrontCakeCard.tsx");
const addButtonSrc = readSrc(
  "src/workspaces/storefront/cart/AddToOrderSheet.tsx",
);
const cartSrc = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");
const browseSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontBrowsePage.tsx",
);
const draftSrc = readSrc("src/workspaces/storefront/checkout/preorder-draft.ts");

assert.match(catalogueSrc, /grid grid-cols-2/);
assert.match(catalogueSrc, /lg:grid-cols-3/);
assert.doesNotMatch(catalogueSrc, /sm:grid-cols-2 lg:grid-cols-3/);
assert.match(browseSrc, /max-w-5xl px-5/);
assert.match(browseSrc, /Currently published cakes for Whitebird/);
assert.match(browseSrc, /sm:hidden/);
assert.match(browseSrc, /hidden sm:inline/);
assert.match(browseSrc, /Discover cakes currently published for Whitebird/);
assert.match(browseSrc, /sm:mt-8 sm:text-3xl/);
assert.match(browseSrc, /py-5 sm:px-6 sm:py-10/);
assert.match(browseSrc, /Prefer a monthly collection or Special Menu/);
assert.match(catalogueSrc, /gap-x-3/);
assert.match(catalogueSrc, /StorefrontCakeCard/);
assert.match(catalogueSrc, /md:hidden/);
assert.match(cardSrc, /AddToOrderButton/);
assert.match(cardSrc, /cake=\{cake\}/);
assert.match(cardSrc, /h-11 min-h-11/);
assert.match(cardSrc, /bg-mist/);
assert.match(cardSrc, /border-ink/);
assert.match(cardSrc, /text-ink/);
assert.match(cardSrc, /text-\[15px\]/);
assert.match(cardSrc, /font-medium/);
assert.match(cardSrc, /rounded-xl/);
assert.match(cardSrc, /sm:bg-ink/);
assert.match(cardSrc, /sm:text-mist/);
assert.match(cardSrc, /sm:rounded-full/);
assert.match(cardSrc, /sm:text-sm/);
assert.match(cardSrc, /View cake/);
assert.match(cardSrc, /overflow-hidden/);
assert.match(
  addButtonSrc,
  /inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-medium/,
);
assert.match(addButtonSrc, /onClick=\{\(\) => setOpen\(true\)\}/);
assert.match(addButtonSrc, /<AddToOrderSheet/);
assert.match(addButtonSrc, /cake=\{cake\}/);
assert.match(addButtonSrc, /createPortal/);
assert.match(addButtonSrc, /document\.body/);
assert.match(addButtonSrc, /role="dialog"/);
assert.match(addButtonSrc, /fixed inset-0 z-50/);
assert.match(addButtonSrc, /absolute inset-x-0 bottom-0 z-\[60\]/);
assert.doesNotMatch(addButtonSrc, /dismissFromBackdrop/);
assert.doesNotMatch(addButtonSrc, /allowDismissRef/);
assert.doesNotMatch(addButtonSrc, /showModal/);
assert.doesNotMatch(addButtonSrc, /<dialog/);
assert.match(cardSrc, /cakeCardPreorderLabel/);
assert.match(cardSrc, /absolute top-3 left-3/);
assert.match(cardSrc, /aspect-\[4\/3\]/);
assert.match(cardSrc, /50vw/);
assert.match(cardSrc, /sm:rounded-2xl sm:border/);
assert.match(cardSrc, /sm:block/);
assert.match(cardSrc, /sm:inline-flex/);

assert.match(cartSrc, /View Order →/);
assert.match(cartSrc, /fixed right-0 bottom-0 left-0 z-40/);
assert.match(cartSrc, /md:hidden/);
assert.match(cartSrc, /h-dvh/);
assert.match(cartSrc, /createPortal/);
assert.match(cartSrc, /document\.body/);
assert.match(cartSrc, /bg-ink\/40/);
assert.match(cartSrc, /z-50/);
assert.match(cartSrc, /z-\[60\]/);
assert.match(cartSrc, /Close order/);
assert.match(cartSrc, /View My Order/);
assert.match(cartSrc, /Continue Ordering/);
assert.match(cartSrc, /md:fixed md:inset-y-0 md:right-0/);
assert.doesNotMatch(cartSrc, /showModal/);
assert.doesNotMatch(cartSrc, /<dialog/);
assert.doesNotMatch(cartSrc, /85dvh/);
assert.doesNotMatch(cartSrc, /writePreorderDraft/);
assert.match(draftSrc, /whitebird-preorder-draft-v1/);

const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
assert.doesNotMatch(extraPageSrc, /BrowseCakeCatalogue/);
assert.doesNotMatch(extraPageSrc, /StorefrontCartShell/);

console.log("PASS storefront mobile catalogue and cart overlay");
