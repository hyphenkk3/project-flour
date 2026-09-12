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
assert.match(browseSrc, /Explore cakes Whitebird has offered/);
assert.match(browseSrc, /sm:hidden/);
assert.match(browseSrc, /hidden sm:inline/);
assert.match(browseSrc, /Explore the full Whitebird collection/);
assert.match(browseSrc, /sm:mt-8 sm:text-4xl/);
assert.match(browseSrc, /py-4 sm:px-6 sm:py-10/);
assert.match(browseSrc, /Prefer a monthly collection or Special Menu/);
assert.match(browseSrc, /className="mt-8 sm:mt-8"/);
assert.doesNotMatch(browseSrc, /className="mt-4 sm:mt-8"/);
const linkToSearch = browseSrc.slice(
  browseSrc.indexOf("Prefer a monthly collection or Special Menu"),
  browseSrc.indexOf("BrowseCakeCatalogue"),
);
assert.doesNotMatch(linkToSearch, /PreorderInProgressBar/);
assert.match(browseSrc, /PreorderInProgressBar/);
assert.match(catalogueSrc, /showMobileSize/);
assert.match(catalogueSrc, /sizeId\}-mobile/);
assert.match(catalogueSrc, /setFilters\(\{ \.\.\.filters, size: event\.target\.value \}\)/);
assert.match(catalogueSrc, /options\.sizes\.map/);
assert.match(catalogueSrc, /min-w-0 md:hidden/);
assert.doesNotMatch(catalogueSrc, /id: "size"/);
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
assert.match(cardSrc, /rounded-md/);
assert.match(cardSrc, /sm:bg-transparent/);
assert.match(cardSrc, /sm:text-sm/);
assert.match(cardSrc, /View cake/);
assert.match(cardSrc, /overflow-hidden/);
assert.match(
  addButtonSrc,
  /inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md px-4 text-sm font-medium/,
);
assert.match(addButtonSrc, /onClick=\{\(\) => setOpen\(true\)\}/);
assert.match(addButtonSrc, /<AddToOrderSheet/);
assert.match(addButtonSrc, /cake=\{cake\}/);
assert.match(addButtonSrc, /from "@\/workspaces\/storefront\/StorefrontOverlay"/);
assert.match(addButtonSrc, /<StorefrontOverlay/);
assert.match(addButtonSrc, /labelledBy=\{titleId\}/);
assert.match(addButtonSrc, /max-h-\[100dvh\]/);
assert.match(addButtonSrc, /md:max-h-\[calc\(100dvh-5rem\)\]/);
assert.match(
  addButtonSrc,
  /flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto/,
);
assert.doesNotMatch(addButtonSrc, /from "react-dom"/);
assert.doesNotMatch(addButtonSrc, /createPortal/);
assert.doesNotMatch(addButtonSrc, /role="dialog"/);
assert.doesNotMatch(addButtonSrc, /dismissFromBackdrop/);
assert.doesNotMatch(addButtonSrc, /allowDismissRef/);
assert.doesNotMatch(addButtonSrc, /showModal/);
assert.doesNotMatch(addButtonSrc, /<dialog/);
assert.match(cardSrc, /cakeCardPreorderLabel/);
assert.match(cardSrc, /absolute top-3 left-3/);
assert.match(cardSrc, /aspect-\[4\/3\]/);
assert.match(cardSrc, /50vw/);
assert.doesNotMatch(cardSrc, /sm:rounded-2xl sm:border/);
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

const collectionSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx",
);
const collectionIntro = collectionSrc.slice(
  collectionSrc.indexOf("← Choose your collection"),
  collectionSrc.indexOf("BrowseCakeCatalogue"),
);
assert.doesNotMatch(collectionIntro, /PreorderInProgressBar/);
assert.match(collectionSrc, /PreorderInProgressBar/);
assert.match(collectionSrc, /py-4 sm:px-6 sm:py-10/);
assert.match(collectionSrc, /mt-6 sm:mt-8/);

const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
assert.doesNotMatch(extraPageSrc, /BrowseCakeCatalogue/);
assert.doesNotMatch(extraPageSrc, /StorefrontCartShell/);

console.log("PASS storefront mobile catalogue and cart overlay");
